// 工作区框架；不参与伤害计算。
export const VIEWS = {
  setup: { label: '角色与输出', heading: '定义你的下一击。', description: '选定角色与技能，录入局外面板，查看每一个伤害乘区。' },
  relics: { label: '遗器配装', heading: '把每个词条算清楚。', description: '选择主词条，按强化规则编辑副词条，让合法配装自动进入面板。' },
  buffs: { label: '增益管理', heading: '每一份加成都有来处。', description: '逐条选择自身与辅助增益，按来源、属性和作用对象管理。' },
  battle: { label: '战斗情境', heading: '把伤害放进真实情境。', description: '选择赛期、敌人与战斗状态，对比血量和辅助收益。' },
  data: { label: '数据与来源', heading: '让每个数字有据可查。', description: '查看本地数据库覆盖、已补齐的效果，以及仍需输入或核实的内容。' },
};
export function renderDashboard({ st, character, ability, picked, data }) {
  const get = (id) => document.getElementById(id);
  const key = st.view ?? 'setup', view = VIEWS[key] ?? VIEWS.setup;
  get('right').hidden = key === 'sim';
  get('calc').hidden = key === 'sim';
  get('left').style.gridColumn = key === 'sim' ? '1 / -1' : '';
  for (const id of Object.keys(VIEWS)) {
    get('view-' + id).hidden = id !== key;
    const nav = get('nav-' + id);
    nav.className = 'nav-item' + (id === key ? ' active' : '');
    nav.setAttribute?.('aria-current', id === key ? 'page' : 'false');
    nav.onclick = () => { st.view = id; renderDashboard({ st, character, ability, picked, data }); };
  }
  get('shell-view-label').textContent = view.label;
  get('shell-heading').textContent = view.heading;
  get('shell-description').textContent = view.description;
  get('shell-character').textContent = character;
  get('shell-ability').textContent = ability?.name ?? '尚未选择技能';
  get('shell-selected').textContent = `已选 ${picked} 项增益`;
  get('shell-version').textContent = `数据版本 ${data._meta?.version ?? '4.5'} · ${data.characters.length} 角色`;
}
