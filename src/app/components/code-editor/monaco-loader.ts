// Lazy Monaco loading (CE-01). Monaco is only imported the first time an editor renders, so it
// never lands in the initial bundle.

type Monaco = typeof import('monaco-editor');

let loading: Promise<Monaco> | null = null;

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker(workerId: string, label: string): Worker };
  }
}

export function loadMonaco(): Promise<Monaco> {
  if (!loading) {
    self.MonacoEnvironment = {
      getWorker(_id: string, label: string) {
        if (label === 'json') {
          return new Worker(new URL('./workers/json.worker', import.meta.url), { type: 'module' });
        }
        if (label === 'typescript' || label === 'javascript') {
          return new Worker(new URL('./workers/ts.worker', import.meta.url), { type: 'module' });
        }
        return new Worker(new URL('./workers/editor.worker', import.meta.url), { type: 'module' });
      }
    };
    loading = Promise.all([import('monaco-editor'), loadStylesheet()]).then(([monaco]) => {
      defineThemes(monaco);
      return monaco;
    });
  }
  return loading;
}

/** Monaco's stylesheet is copied to /monaco by the build `assets` config. */
function loadStylesheet(): Promise<void> {
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('monaco/editor.main.css', document.baseURI).href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

function defineThemes(monaco: Monaco): void {
  monaco.editor.defineTheme('ngf-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editor.lineHighlightBackground': '#f5f5f5',
      'editorLineNumber.foreground': '#a3a3a3',
      'editorGutter.background': '#ffffff'
    }
  });
  monaco.editor.defineTheme('ngf-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#171717',
      'editor.lineHighlightBackground': '#262626',
      'editorLineNumber.foreground': '#737373',
      'editorGutter.background': '#171717'
    }
  });
}
