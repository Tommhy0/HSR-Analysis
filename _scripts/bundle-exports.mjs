// Collect simple variable bindings, ignoring commas inside initializers.
// Destructuring exports are rejected explicitly instead of silently omitted.
export function declarationNames(source, start) {
  const names = [];
  let depth = 0, binding = true, expression = true;
  for (let i = start; i < source.length;) {
    const c = source[i];
    if (/\s/.test(c)) { i++; continue; }
    if (source.startsWith('//', i)) { i = source.indexOf('\n', i); if (i < 0) break; continue; }
    if (source.startsWith('/*', i)) { const end = source.indexOf('*/', i + 2); if (end < 0) throw new Error('Unclosed comment'); i = end + 2; continue; }
    if (binding && depth === 0) {
      const m = /^[A-Za-z_$][\w$]*/.exec(source.slice(i));
      if (!m) throw new Error('打包器暂不支持解构导出，请使用显式 export 列表');
      names.push(m[0]); i += m[0].length; binding = false; expression = false; continue;
    }
    if (c === ';' && depth === 0) break;
    if (c === ',' && depth === 0) { binding = true; expression = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`' || c === '/' && expression) {
      const quote = c; let cls = false; i++;
      for (; i < source.length; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (quote === '/') { if (source[i] === '[') cls = true; if (source[i] === ']') cls = false; }
        if (source[i] === quote && !cls) { i++; break; }
      }
      expression = false; continue;
    }
    if ('([{'.includes(c)) { depth++; expression = true; }
    else if (')]}'.includes(c)) { depth--; expression = false; }
    else if ('=,:!?&|+-*%<>'.includes(c)) expression = true;
    else if (/[\w$]/.test(c)) {
      const token = /^[\w$]+/.exec(source.slice(i))[0];
      expression = ['return','throw','typeof','void','delete','new','yield','await'].includes(token);
      i += token.length; continue;
    }
    i++;
  }
  return names;
}
