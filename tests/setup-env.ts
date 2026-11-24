import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LOOPENGINE_SCHEDULER_DIR ??= mkdtempSync(join(tmpdir(), 'loopengine-test-scheduler-'))
