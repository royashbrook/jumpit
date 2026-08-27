import { transform } from 'esbuild'

export async function compactJavaScript(source, file = 'JavaScript') {
  const result = await transform(source, {
    sourcefile: file,
    minifyWhitespace: true,
    minifyIdentifiers: false,
    minifySyntax: false,
    legalComments: 'inline',
  })
  return result.code
}
