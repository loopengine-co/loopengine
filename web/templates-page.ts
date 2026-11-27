// Templates are now workflow examples, on the Workflows page
// (web/workflows-overview-page.ts). This page only sends a project server from an
// older template, which still serves it at /templates, there.

/** @deprecated The console redirects /templates to the workflow examples. */
export const templatesPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=/workflows?view=examples">
<title>Workflow examples</title>
</head>
<body>
<p>Templates are now workflow examples: <a href="/workflows?view=examples">open them</a>.</p>
</body>
</html>`
