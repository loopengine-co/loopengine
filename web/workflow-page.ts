// What /workflows/new was, the "Build a workflow" page, is now the New
// workflow dialog on the Workflows page (web/new-workflow-dialog.ts), and
// its examples the Workflows page's Examples view. The console's server
// no longer has /workflows/new. A project server from an older template
// still serves this page there (its adapter imports it, so it stays):
// it forwards to /workflows?new=1 with the same address (an agent, a
// description, a goal's suggestion), or to the examples for #examples.

/** @deprecated For a project server from an older template, which serves it at /workflows/new. */
export const workflowPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>New workflow</title>
<script>
(function () {
  var q = location.search ? '&' + location.search.slice(1) : '';
  location.replace(location.hash === '#examples' ? '/workflows?view=examples' : '/workflows?new=1' + q);
})();
</script>
</head>
<body>
<p>Opening <a href="/workflows?new=1">New workflow</a>.</p>
</body>
</html>`
