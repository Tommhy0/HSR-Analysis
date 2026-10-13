export function initTheme() {
  const root=document.documentElement, select=document.getElementById('f-theme');
  if(!root || !select) return;
  let saved=null; try {saved=localStorage.getItem('hsr-theme');} catch {}
  const query=typeof location==='undefined' ? null : new URLSearchParams(location.search).get('theme');
  const theme=query ?? root.dataset?.defaultTheme ?? saved ?? 'dark';
  const apply=(value)=>{root.setAttribute('data-theme',value==='light'?'light':'dark');select.value=value==='light'?'light':'dark';};
  apply(theme); select.onchange=()=>{apply(select.value);try {localStorage.setItem('hsr-theme',select.value);}catch {}};
}
