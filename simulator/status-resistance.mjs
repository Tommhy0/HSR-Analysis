// Apply immunity before inserting any negative effect, in every runtime path.
export function resistsStatus(b, from, to, effect, {combatPanel, record}) {
  if (!(effect.debuff || effect.control || effect.type === 'dot')) return false;
  const ward = to.buffs.find(e => e.tag === 'debuffWard' && e.stacks > 0
    && (!e.requiresTag || b.units.find(u=>u.id===e.requiresTag.unit)?.buffs.some(x=>x.tag===e.requiresTag.tag)));
  if (ward) {
    ward.stacks--;
    record(b,'resist',to,{name:'求生反应 · 抵抗负面效果'});
    return true;
  }
  if (to.kit?.characterId === 1207 && to.kit.trace?.[1]
    && (to.resources['襄尺冷却'] ?? 0) <= to.turns) {
    to.resources['襄尺冷却'] = to.turns + to.kit.trace[1][0];
    record(b,'resist',to,{name:'襄尺 · 抵抗负面效果'});
    return true;
  }
  const resistance = effect.control ? combatPanel(to).controlRes ?? to.controlRes ?? 0 : 0;
  if (resistance >= 1 || resistance > 0 && b.random() < resistance) {
    record(b,'resist',to,{name:resistance>=1?'免疫控制类负面状态':'抵抗控制类负面状态'});
    return true;
  }
  return false;
}
