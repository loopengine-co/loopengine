// Scheduling tools every agent gets (unless its config sets
// `selfScheduling: false`): an agent can schedule a message to *itself*
// for later — once, or on an interval — and list, check or cancel its own
// scheduled tasks. Bound to the calling agent at construction, so it can
// never schedule, see or cancel another agent's tasks. The scheduler that
// actually fires them is the server's (core/scheduler.ts); the console's
// Schedules tab shows the same tasks.
import type { ToolDefinition } from '../agent-config.js'
import {
  cancelScheduledTask,
  createScheduledTask,
  getScheduledTask,
  listScheduledTasks,
  type ScheduledTask,
  type ScheduledTaskStatus,
} from '../scheduler.js'

/** How many active (not done or cancelled) tasks one agent may create
 * through these tools — each run is a model call, so a runaway loop of
 * "schedule another one" stops here. The console and API aren't capped. */
function maxActivePerAgent(): number {
  const n = Number(process.env.LOOPENGINE_SCHEDULER_MAX_PER_AGENT)
  return Number.isInteger(n) && n > 0 ? n : 25
}

function summary(t: ScheduledTask) {
  return {
    task_id: t.task_id,
    task_name: t.task_name,
    message: t.message,
    schedule: t.schedule,
    status: t.status,
    next_run_at: t.next_run_at,
    run_count: t.run_count,
    last_status: t.last_status,
  }
}

export function createScheduleTools(agentName: string): ToolDefinition[] {
  async function ownTask(taskId: string, tool: string): Promise<ScheduledTask> {
    const task = await getScheduledTask(taskId)
    // Another agent's task reads exactly like a missing one.
    if (!task || task.agent !== agentName) throw new Error(`${tool}: no scheduled task "${taskId}" for this agent`)
    return task
  }

  const scheduleTask: ToolDefinition = {
    name: 'system_schedule_task',
    description:
      'Schedule a message to yourself for later — once at a set time, or repeatedly on an interval — like setting a reminder or a cron job. When it fires you receive the message as a new conversation (none of the current one carries over, so make the message self-contained) and handle it with your tools as usual, with no person live. A tool call that needs approval goes wherever your approval requests are sent and waits; if nowhere is set, it is denied. Use only when the user asks for something to happen later or regularly, never on your own initiative. Use the user\'s time zone (ask if unclear), prefer the longest interval that serves them since each run is a model call, and confirm the schedule back in plain words. Returns task_id and next_run_at.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'What you will receive when the task fires, written as an instruction to your future self with every detail it needs, e.g. "Check whether order 4417 has shipped and email the customer at a@example.com if it has."',
        },
        schedule: {
          type: 'object',
          description:
            'Either { "run_at": "<ISO 8601 timestamp with time zone>" } for once, or { "every": "<interval>" } to repeat until cancelled — a number plus s/m/h/d, e.g. "30m", "1h", "1d"; 30s at the shortest. A repeating task keeps its first slot: started at 10:07 with "1h", it fires at 11:07, 12:07, ...',
          properties: { run_at: { type: 'string' }, every: { type: 'string' } },
        },
        task_name: { type: 'string', description: 'Optional short label, shown when listing tasks and in the console.' },
        notify: { type: 'boolean', description: 'Optional — also send each run\'s result through your notifier (where your approval requests go), so a person sees it.' },
      },
      required: ['message', 'schedule'],
    },
    execute: async (input) => {
      const active = (await listScheduledTasks({ agent: agentName })).filter((t) => t.status !== 'done' && t.status !== 'cancelled')
      if (active.length >= maxActivePerAgent()) {
        throw new Error(`system_schedule_task: you already have ${active.length} active scheduled tasks (the limit is ${maxActivePerAgent()}); cancel one you no longer need first`)
      }
      const task = await createScheduledTask({
        agent: agentName,
        message: String(input.message ?? ''),
        schedule: (input.schedule ?? {}) as { run_at?: unknown; every?: unknown },
        task_name: typeof input.task_name === 'string' ? input.task_name : undefined,
        notify: input.notify === true,
      })
      return JSON.stringify({ task_id: task.task_id, next_run_at: task.next_run_at, schedule: task.schedule })
    },
  }

  const listTasks: ToolDefinition = {
    name: 'system_list_scheduled_tasks',
    description:
      'List your own scheduled tasks (task_id, name, message, schedule, status, next_run_at, run_count, last_status). Check this before scheduling something recurring, so you don\'t create a duplicate. status "awaiting_approval" means a run is waiting on someone to approve or answer.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['scheduled', 'running', 'awaiting_approval', 'paused', 'done', 'cancelled'],
          description: 'Optional — only tasks with this status.',
        },
      },
    },
    execute: async (input) => {
      const status = typeof input.status === 'string' ? (input.status as ScheduledTaskStatus) : undefined
      return JSON.stringify((await listScheduledTasks({ agent: agentName, status })).map(summary))
    },
    safe: true,
  }

  const checkTask: ToolDefinition = {
    name: 'system_check_scheduled_task',
    description:
      'Get one of your scheduled tasks in full — schedule, status, next_run_at, and recent runs, each "ok" with your reply from that run or "error" with what went wrong (for example, a call that needed approval was denied because nowhere is set to send approval requests).',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'The task_id from system_schedule_task or system_list_scheduled_tasks.' } },
      required: ['task_id'],
    },
    execute: async (input) => JSON.stringify(await ownTask(String(input.task_id ?? ''), 'system_check_scheduled_task')),
    safe: true,
  }

  const cancelTask: ToolDefinition = {
    name: 'system_cancel_scheduled_task',
    description:
      'Cancel one of your scheduled tasks so it doesn\'t fire again. A run already waiting on an approval finishes first. Its history stays (status "cancelled").',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'The task_id from system_schedule_task or system_list_scheduled_tasks.' } },
      required: ['task_id'],
    },
    execute: async (input) => {
      const task = await ownTask(String(input.task_id ?? ''), 'system_cancel_scheduled_task')
      if (task.status === 'cancelled') return JSON.stringify({ task_id: task.task_id, status: 'cancelled', already: true })
      const after = await cancelScheduledTask(task.task_id)
      return JSON.stringify({ task_id: task.task_id, status: after.status, ...(after.cancel_after_run ? { note: 'cancels once the run waiting on an approval finishes' } : {}) })
    },
  }

  return [scheduleTask, listTasks, checkTask, cancelTask]
}
