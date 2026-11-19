function drawRaidDiagram(key, caption, questionId = null) {
  const test = Boolean(questionId);
  const circle = (x, y, radius, style) => `<circle cx="${x}" cy="${y}" r="${radius}" class="${style}"/>`;
  const line = (path, style = 'map-rule') => `<path d="${path}" class="${style}"/>`;
  const label = (x, y, text, style = '') => `<text x="${x}" y="${y}" class="${style}">${text}</text>`;
  const arrow = (x1, y1, x2, y2, style = 'map-gold-line', animate = true) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const base = [x2 - 10 * Math.cos(angle), y2 - 10 * Math.sin(angle)];
    const dx = 4 * Math.sin(angle), dy = 4 * Math.cos(angle);
    const shaft = `M${x1} ${y1}L${x2} ${y2}`;
    const arrowhead = `M${base[0] + dx} ${base[1] - dy}L${x2} ${y2} ${base[0] - dx} ${base[1] + dy}`;
    // Animate only existing route arrows; facing indicators remain static.
    const traveler = `<circle class="map-flow-dot map-flow-trail" r="3"><animateMotion path="${shaft}" dur="3s" begin="-.18s" repeatCount="indefinite"/></circle><circle class="map-flow-dot" r="4"><animateMotion path="${shaft}" dur="3s" repeatCount="indefinite"/></circle>`;
    return line(shaft + arrowhead, style) + (animate ? line(shaft, 'map-route-glow') + traveler : '');
  };
  const token = (x, y, text, style = 'map-ally', radius = 12) =>
    circle(x, y, radius + 4, 'map-token-aura') + circle(x, y, radius, style) + circle(x, y, Math.max(radius - 3, 1), 'map-token-ring') + label(x, y + 4.5, text, 'map-token');
  const arena = (x = 280, y = 135, radius = 106) => circle(x, y, radius + 5, 'map-field-halo') + circle(x, y, radius, 'map-field') + circle(x, y, radius - 12, 'map-grid');
  const boss = (x = 280, y = 135, text = '首领', style = 'map-boss') => token(x, y, text, style, 24);
  const spider = (x, y) => token(x, y, '大', 'map-boss', 17);
  const swarm = (x, y) => [[-16, -4], [9, -16], [12, 9], [-6, 15]].map(([dx,dy]) => circle(x+dx, y+dy, 5, 'map-hazard map-spiderling')).join('');
  const legends = {
    'twins-distance': [['red', '火侧'], ['teal', '冰侧'], ['dash', '约 8 米边界']],
    'twins-orbs': [['red', '火球'], ['teal', '冰球']],
    'twins-heal': [['teal', '机制岗位'], ['gold-arrow', '处理顺序']],
    'twins-swap': [['red', '火侧'], ['teal', '冰侧'], ...(!test ? [['gold-arrow', '转场示意']] : [])],
    'spirit-select': [['red', '炸弹'], ['teal', '队员'], ['dash', '首领附近'], ...(!test ? [['red-arrow', '撤离示意']] : [])],
    'spirit-facing': [['red', '带业火'], ['teal', '外场'], ['teal-arrow', '角色面向']],
    'spirit-lamps': [['gold', '灯位'], ['teal', '队员'], ['gold-arrow', '引导方向']],
    'spirit-rotation': [['red', '隔离内'], ['teal', '外场'], ['gold-arrow', '轮换方向']],
    'witch-line': [['red-line', '不祥气息'], ['teal', '队员'], ...(!test ? [['teal-arrow', '带位路线示意']] : [])],
    'witch-charge': [['gold', '首领'], ['teal', '队员'], ['gold-arrow', '面向']],
    'witch-bomb': [['red', '被标记'], ['red-line', '不祥气息'], ['teal', '其他队员'], ...(!test ? [['red-arrow', '撤离示意']] : [])],
    'witch-spiders': [['gold', '大蜘蛛 / 首领'], ['red', '小蜘蛛'], ...(!test ? [['teal-arrow', '聚怪'], ['red-arrow', '转向首领']] : [])],
    'witch-wave': [['gold', '震荡范围示意'], ['teal', '队员'], ...(!test ? [['gold-arrow', '点名方向示意']] : [])],
  };
  let art;

  switch (key) {
    case 'twins-distance':
      art = [boss(145, 135, '灼热剑', 'map-hazard'), boss(414, 135, '酷寒剑', 'map-ally'),
        circle(145, 135, 65, 'map-red-grid'), circle(414, 135, 65, 'map-grid'),
        token(56, 135, 'T', 'map-hazard'), token(test ? 514 : 459, 135, 'T'),
        line('M280 32v206'), label(145, 226, '灼热剑区域'), label(414, 226, '酷寒剑区域')].join('');
      if (test) art += label(507, 171, '击退后');
      else art += label(56, 171, '火 T 在圈外') + label(472, 171, '冰 T 在圈内');
      break;
    case 'twins-orbs':
      art = [arena(145, 135, 95), arena(415, 135, 95), boss(145, 135, '灼热剑', 'map-hazard'), boss(415, 135, '酷寒剑', 'map-ally'),
        circle(94, 81, 8, 'map-hazard map-orb'), circle(195, 178, 8, 'map-ally map-orb'),
        circle(365, 81, 8, 'map-hazard map-orb'), circle(465, 178, 8, 'map-ally map-orb'),
        label(145, 26, '灼热剑侧', 'map-gold-text'), label(415, 26, '酷寒剑侧', 'map-soft'),
        label(91, 65, '火球'), label(195, 207, '冰球'), label(365, 65, '火球'), label(465, 207, '冰球')].join('');
      if (!test) art += label(145, 252, '同色挡球 · 异色治疗') + label(415, 252, '同色挡球 · 异色治疗');
      break;
    case 'twins-heal':
      art = [token(118, 112, '花', 'map-ally', 22), token(280, 112, '珠', 'map-ally', 22), token(442, 112, 'T', 'map-boss', 22),
        arrow(149, 112, 248, 112), arrow(312, 112, 410, 112),
        label(118, 65, '01 踩花', 'map-gold-text'), label(280, 65, '02 拾取', 'map-gold-text'), label(442, 65, '03 治疗', 'map-gold-text'),
        label(118, 154, '同色位踩花'), label(280, 154, '治疗位拾取'), label(442, 154, '指示对准主 T'),
        line('M40 188H520'), label(114, 223, '一刀 · 二刀', 'map-soft'), label(282, 223, '三刀', 'map-gold-text'), label(450, 223, '四刀', 'map-gold-text'),
        label(114, 249, '小加', 'map-soft'), label(282, 249, '准备大加'), label(450, 249, '接续大加')].join('');
      break;
    case 'twins-swap':
      art = [line('M247 25v220M313 25v220'), label(280, 47, '河道', 'map-soft'),
        boss(126, 82, '灼热剑', 'map-hazard'), boss(434, 82, '酷寒剑', 'map-ally'),
        token(72, 122, 'T', 'map-hazard'), token(488, 122, 'T'),
        token(97, 183, '疗'), token(463, 183, '疗'), label(110, 230, '本侧队伍'), label(444, 230, '对岸队伍')].join('');
      if (!test) art += arrow(167, 79, 391, 79) + arrow(393, 116, 169, 116, 'map-ally-line') + label(280, 174, '吸人结束后') + arrow(118, 184, 444, 184, 'map-rule');
      break;
    case 'spirit-select':
      art = [boss(), circle(280, 135, 66, 'map-grid'), token(320, 106, '弹', 'map-hazard'),
        token(247, 187, 'T', 'map-ally'), token(205, 163, '队'), token(224, 204, '队'),
        token(137, 78, 'A'), token(96, 122, 'B'), token(115, 172, 'C'), label(115, 216, test ? '分散队员' : '业火远点组'),
        label(339, 78, '波动炸弹')].join('');
      if (!test) art += arrow(344, 110, 479, 153, 'map-red-line') + label(476, 186, '撤离方向');
      break;
    case 'spirit-facing':
      art = [boss(), token(128, 135, '火', 'map-hazard', 18), token(431, 135, '外', 'map-ally', 18),
        arrow(157, 135, 244, 135, 'map-red-line', false), arrow(458, 135, 516, 135, 'map-ally-line', false),
        label(128, 182, '带业火 · 进隔离'), label(431, 182, '留外场 · 背对'), label(280, 222, '击倒切换时')].join('');
      break;
    case 'spirit-lamps': {
      const lights = [[280,35],[363,80],[363,191],[280,234],[197,191],[197,80]];
      art = arena() + boss() + lights.map(([x,y]) => token(x,y,'灯','map-lamp',12)).join('');
      art += token(318, 106, 'T') + arrow(329, 94, 352, 83) + token(232, 165, '队');
      if (!test) art += label(453,75,'引向待染灯') + label(106,196,'外场站位') + line('M416 76h-33 M152 190l48-19');
      break;
    }
    case 'spirit-rotation':
      art = [label(125, 63, '本轮', 'map-soft'), label(280, 63, '击倒切换', 'map-soft'), label(435, 63, '下一轮', 'map-soft'),
        token(125, 111, 'A', 'map-hazard', 21), token(125, 186, 'B', 'map-ally', 21),
        token(435, 111, 'B', 'map-hazard', 21), token(435, 186, 'A', 'map-ally', 21),
        arrow(154, 111, 400, 111), arrow(154, 186, 400, 186, 'map-ally-line'),
        label(280, 98, '隔离内'), label(280, 172, '外场'), label(280, 232, 'A 出场后 · 约 30 秒后遗症')].join('');
      break;
    case 'witch-line':
      art = [arena(), `<g class="map-rotating-danger">${line('M280 135L184 90 M280 135L323 38', 'map-red-line')}</g>`, boss(305, 154, '首领'),
        token(340, 156, 'T'), token(293, 192, '近'), token(234, 164, '队'), label(113, 72, '不祥气息')].join('');
      if (!test) art += line('M348 168q6 37-35 50', 'map-ally-line') + line('M348 168q6 37-35 50', 'map-route-glow')
        + '<circle class="map-flow-dot" r="4"><animateMotion path="M348 168q6 37-35 50" dur="3s" repeatCount="indefinite"/></circle>'
        + arrow(334, 207, 313, 218, 'map-ally-line', false) + label(448, 208, '沿内侧带位');
      break;
    case 'witch-charge':
      art = [arena(280, 135, 108), boss(), arrow(308, 135, 348, 135, 'map-gold-line', false), label(360, 162, '面向'),
        token(216, 197, '队'), token(241, 217, '队'), label(117, 214, '队友区')].join('');
      if (!test) art += arrow(252, 135, 188, 135, 'map-ally-line') + label(110, 138, '后冲方向') + label(449, 137, '前冲方向')
        + line('M304 126L372 74A112 112 0 0 1 386 121Z', 'map-scan') + label(458, 65, '扇面朝空处');
      break;
    case 'witch-bomb':
      art = [arena(), circle(280, 135, 54, 'map-grid'), boss(275, 129),
        token(305, 168, '弹', 'map-hazard'), token(257, 170, '候'), token(289, 91, '候'),
        token(208, 194, '蛛'), token(346, 88, '队'), line('M280 135L204 61', 'map-red-line'),
        label(115, 67, '不祥气息'), label(115, 213, '蜘蛛组'), label(455, 90, '其他队员')].join('');
      if (!test) art += arrow(317, 179, 377, 215, 'map-red-line') + label(449, 218, '撤向空处');
      break;
    case 'witch-spiders':
      if (questionId === 'q070') {
        art = arena() + spider(280, 137) + swarm(346, 193) + swarm(219, 82)
          + label(280, 171, '大蜘蛛') + label(430, 185, '小蜘蛛') + label(146, 83, '小蜘蛛');
        break;
      }
      art = [arena(), boss(280, 125, '首领'), spider(364, 178), swarm(399, 191),
        spider(195, 150), swarm(160, 172), spider(279, 49), swarm(312, 51),
        label(417, 162, '小蜘蛛'), label(379, 231, '处理区 A'), label(176, 222, '处理区 B'), label(223, 40, '处理区 C')].join('');
      if (!test) art += arrow(412, 204, 385, 186, 'map-ally-line') + arrow(349, 166, 306, 140, 'map-red-line', false) + label(440, 86, '大蜘蛛转向首领');
      if (questionId === 'q071') art += arrow(349, 166, 306, 140, 'map-red-line');
      break;
    case 'witch-wave':
      art = [arena(260, 135, 98), boss(260, 135, '首领'), token(203, 189, '队'), token(251, 202, '队'),
        circle(420, 122, 31, 'map-wave-ring'), circle(420, 122, 21, 'map-grid'),
        token(420, 122, '远'), label(419, 180, '远点位'), label(420, 207, '留意震荡预兆')].join('');
      if (!test) art += arrow(292, 128, 380, 123) + label(331, 95, '注意点名');
      break;
    default:
      throw new Error(`Unknown raid diagram: ${key}`);
  }

  const vertical = [40,80,120,160,200,240,280,320,360,400,440,480,520].map(x => `M${x} 0v270`).join(' ');
  const horizontal = [45,90,135,180,225].map(y => `M0 ${y}h560`).join(' ');
  const grid = `<path class="map-underlay" d="${vertical} ${horizontal}"/>`;
  const legend = (legends[key] || []).map(([tone, text]) => `<span><i class="legend-mark legend-${tone}" aria-hidden="true"></i>${text}</span>`).join('');
  const legendMarkup = legend ? `<span class="diagram-legend">${legend}</span>` : '';
  const motionNote = key === 'witch-line' ? '<span class="diagram-motion-note">旋转动画仅作示意，实际方向与速度以场内为准。</span>' : '';
  return `<figure class="raid-diagram" data-diagram="${key}"><div class="diagram-top"><span>站位与路线示意</span><div class="diagram-controls"><button type="button" class="diagram-pause" data-action="toggle-diagram-motion" aria-pressed="false">暂停</button><button type="button" class="diagram-zoom" data-action="zoom-diagram" aria-label="放大查看机制示意图"><svg class="icon" aria-hidden="true"><use href="#icon-zoom"/></svg>放大</button></div></div><svg viewBox="0 0 560 270" role="img" aria-label="${caption}">${grid}${art}</svg><figcaption><span>${caption}</span>${motionNote}${legendMarkup}</figcaption></figure>`;
}
