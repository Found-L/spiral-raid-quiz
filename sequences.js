// The positions below are illustrative snapshots, not fixed in-game coordinates.
// Moving a complete labelled role makes the order of each mechanic visible.
const sceneLabel = (x, y, text, tone = '') => `<text x="${x}" y="${y}" class="scene-label ${tone}">${text}</text>`;
const sceneLine = (path, tone = 'ally') => `<path d="${path}" class="scene-path ${tone}"/>`;
const sceneCue = (name, content) => `<g class="scene-cue" data-cue="${name}">${content}</g>`;
const sceneCircle = (x, y, r, tone = '') => `<circle cx="${x}" cy="${y}" r="${r}" class="scene-zone ${tone}"/>`;
const sceneActor = (actor) => {
  const {id, x, y, text, tone = 'ally', r = 17, mark = ''} = actor;
  return `<g class="scene-actor" data-actor="${id}" style="transform:translate(${x}px,${y}px)"><circle r="${r}" class="scene-piece ${tone}"/><text class="scene-piece-text" y="5">${text}</text>${mark}</g>`;
};
const point = (id, x, y, text, tone = 'ally', r = 17, mark = '') => ({id, x, y, text, tone, r, mark});
const RAID_SEQUENCES = {
  'twins-distance': {
    background: sceneCircle(145,125,65,'fire-boundary') + sceneCircle(414,125,65,'boundary') + sceneLabel(145,234,'灼热剑侧') + sceneLabel(414,234,'酷寒剑侧'),
    actors: [point('fire',145,125,'火','hazard',25),point('ice',414,125,'冰','ally',25),point('ft',52,125,'T','hazard'),point('it',455,125,'T')],
    cues: sceneCue('knock', sceneLine('M455 125 L512 125 M502 118 L512 125 L502 132','hazard') + sceneLabel(507,171,'击退')) + sceneCue('return', sceneLine('M500 125 L461 125 M471 118 L461 125 L471 132','ally')),
    steps: [
      {text:'火 T 在约 8 米外，冰 T 靠近冰首领。'},
      {text:'冰 T 被击退后，先确认身边的安全方向。', positions:{it:[510,125]}, cues:['knock']},
      {text:'冰 T 尽快回到首领附近；火 T 保持距离。', cues:['return']},
    ],
  },
  'twins-orbs': {
    background: sceneLabel(142,32,'灼热剑侧','gold') + sceneLabel(420,32,'酷寒剑侧','gold') + sceneCircle(142,132,82) + sceneCircle(420,132,82) + sceneLabel(91,69,'火球') + sceneLabel(191,210,'冰球') + sceneLabel(370,69,'火球') + sceneLabel(470,210,'冰球'),
    actors: [point('fire',142,132,'火','hazard',23),point('ice',420,132,'冰','ally',23),point('fball',91,85,'','hazard',9),point('iball',191,180,'','ally',9),point('fball2',370,85,'','hazard',9),point('iball2',470,180,'','ally',9),point('block',69,150,'挡','hazard'),point('heal',222,148,'疗')],
    cues: sceneCue('block', sceneLine('M75 138 L87 101 M80 108 L87 101 L91 111','hazard')) + sceneCue('heal', sceneLine('M217 159 L204 171 M214 170 L204 171 L207 160','ally')),
    steps: [
      {text:'先认本侧首领颜色，再确认谁负责挡球和治疗。'},
      {text:'同色挡球位处理同色球；示例为火侧挡火球。',positions:{block:[91,108]},cues:['block']},
      {text:'治疗位按分工准备异色状态；示例为火侧接冰球。',positions:{block:[91,108],heal:[191,157]},cues:['heal']},
    ],
  },
  'twins-heal': {
    background: sceneLabel(92,55,'同色花点','gold') + sceneLabel(276,55,'治疗珠','gold') + sceneLabel(461,55,'本侧主 T','gold'),
    actors:[point('flower',92,116,'花','ally',24),point('pearl',276,116,'珠','ally',20),point('tank',461,116,'T','boss',24),point('flowerRole',54,178,'踩','ally'),point('heal',238,178,'疗')],
    cues:sceneCue('flower',sceneLine('M64 164 L80 136 M77 145 L80 136 L69 141','ally')) + sceneCue('pearl',sceneLine('M247 164 L264 137 M253 143 L264 137 L263 149','ally')) + sceneCue('aim',sceneLine('M303 116 L426 116 M416 108 L426 116 L416 124','ally')),
    steps:[
      {text:'三层同色位处理分配到的同色花点。',positions:{flowerRole:[92,151]},cues:['flower']},
      {text:'治疗位拾取出现的治疗珠。',positions:{flowerRole:[92,151],heal:[276,151]},cues:['pearl']},
      {text:'绿色治疗指示对准本侧主 T，按刀数接续治疗。',positions:{flowerRole:[92,151],heal:[276,151]},cues:['aim']},
    ],
  },
  'twins-swap': {
    background:sceneLabel(145,35,'一侧') + sceneLabel(416,35,'另一侧') + sceneLabel(280,236,'河道 · 左右仅为相对位置'),
    actors:[point('fire',135,91,'火','hazard',23),point('ice',425,91,'冰','ally',23),point('ft',90,139,'T','hazard'),point('it',470,139,'T'),point('heal',92,191,'疗')],
    cues:sceneCue('swap',sceneLine('M171 76 L390 76 M380 69 L390 76 L380 83','hazard')+sceneLine('M389 108 L171 108 M181 101 L171 108 L181 115','ally')) + sceneCue('heal',sceneLine('M115 192 L431 192 M421 184 L431 192 L421 200','ally')),
    steps:[
      {text:'一轮结束，先观察首领的换边与吸引动作。'},
      {text:'首领互换，同色位留意被吸后的落点。',positions:{fire:[425,91],ice:[135,91],ft:[470,139],it:[90,139]},cues:['swap']},
      {text:'吸人结束后，异色治疗位再自行过河。',positions:{fire:[425,91],ice:[135,91],ft:[470,139],it:[90,139],heal:[460,191]},cues:['heal']},
    ],
  },
  'spirit-select': {
    background:sceneCircle(280,128,66,'boundary') + sceneLabel(105,225,'远点业火组') + sceneLabel(445,218,'空处示例'),
    actors:[point('boss',280,128,'首领','boss',25),point('tank',239,166,'T'),point('a',100,84,'A'),point('b',77,129,'B'),point('c',102,173,'C'),point('bomb',321,98,'弹','hazard')],
    cues:sceneCue('bomb',sceneLine('M342 102 L454 159 M443 148 L454 159 L438 159','hazard')),
    steps:[
      {text:'业火组占远点，炸弹候选位靠近首领。'},
      {text:'近点被波动炸弹点名，先看清周围队员。'},
      {text:'被点名者撤向空处，避开队友与隔离内队员。',positions:{bomb:[454,159]},cues:['bomb']},
    ],
  },
  'spirit-facing': {
    background:sceneLabel(123,61,'带业火 · 进隔离','gold') + sceneLabel(438,61,'无业火 · 留外场','gold'),
    actors:[point('boss',280,133,'首领','boss',25),point('fire',124,133,'火','hazard',20),point('outside',434,133,'外','ally',20)],
    cues:sceneCue('face',sceneLine('M153 133 L240 133 M230 125 L240 133 L230 141','hazard')+sceneLine('M463 133 L519 133 M509 125 L519 133 L509 141','ally')),
    steps:[
      {text:'击倒前确认身上有没有业火，报清谁进谁留。'},
      {text:'要进隔离的业火位，在击倒切换时面向首领。',cues:['face']},
      {text:'留外场的无业火队员背对首领，切换后再调整。',cues:['face']},
    ],
  },
  'spirit-lamps': {
    background:sceneCircle(280,130,98) + sceneLabel(280,255,'灯位与引导次序按团队安排'),
    actors:[point('boss',280,130,'首领','boss',24),point('tank',322,130,'T'),point('team',226,166,'队'),point('l1',280,32,'灯','lamp',14),point('l2',365,81,'灯','lamp',14),point('l3',365,179,'灯','lamp',14),point('l4',280,228,'灯','lamp',14),point('l5',195,179,'灯','lamp',14),point('l6',195,81,'灯','lamp',14)],
    cues:sceneCue('first',sceneLine('M301 107 L343 82 M332 84 L343 82 L337 92','gold')) + sceneCue('second',sceneLine('M302 150 L343 177 M337 167 L343 177 L331 175','gold')),
    steps:[
      {text:'染灯阶段，主 T 先认清待染的灯位。'},
      {text:'引导首领攻击覆盖灯位；这里仅示范一个方向。',positions:{tank:[317,105]},cues:['first']},
      {text:'继续按团队路线处理其他灯位，外场让开引导方向。',positions:{tank:[317,155]},cues:['second']},
    ],
  },
  'spirit-rotation': {
    background:sceneCircle(142,135,79,'inside') + sceneCircle(419,135,79) + sceneLabel(142,45,'隔离内','gold') + sceneLabel(419,45,'外场','gold'),
    actors:[point('a',142,135,'A','hazard',22),point('b',419,135,'B','ally',22)],
    cues:sceneCue('leave',sceneLine('M170 109 L386 109 M376 101 L386 109 L376 117','hazard')) + sceneCue('enter',sceneLine('M389 160 L171 160 M181 152 L171 160 L181 168','ally')),
    steps:[
      {text:'A 组在隔离内，B 组在外场准备。'},
      {text:'切换时 A 组出场，留意约 30 秒后遗症。',positions:{a:[419,112],b:[419,158]},cues:['leave']},
      {text:'下一组按业火和击倒口令接替，别让后遗症位抢进。',positions:{a:[419,112],b:[142,135]},cues:['enter']},
    ],
  },
  'witch-line': {
    background:sceneCircle(280,130,104) + sceneLabel(116,60,'不祥气息','hazard') + sceneLabel(443,224,'内侧安全带位'),
    actors:[point('boss',305,155,'首领','boss',24),point('tank',342,158,'T'),point('team',267,189,'队')],
    cues:sceneCue('line1',sceneLine('M280 130 L189 83','hazard')+sceneLine('M280 130 L321 34','hazard')) + sceneCue('line2',sceneLine('M280 130 L180 113','hazard')+sceneLine('M280 130 L347 50','hazard')) + sceneCue('move',sceneLine('M346 180 Q343 206 321 216 M332 215 L321 216 L326 206','ally')),
    steps:[
      {text:'先看不祥气息位置，主 T 与队伍保持安全间隔。',cues:['line1']},
      {text:'危险线移动时，主 T 沿内侧调整，别让首领碰线。',positions:{boss:[301,181],tank:[323,207],team:[252,195]},cues:['line2','move']},
      {text:'队员避开危险线和首领正面，回到安全侧。',positions:{boss:[301,181],tank:[323,207],team:[252,195]},cues:['line2']},
    ],
  },
  'witch-charge': {
    background:sceneCircle(280,130,105) + sceneLabel(126,57,'后冲示例') + sceneLabel(435,207,'队友安全侧'),
    actors:[point('boss',280,125,'首领','boss',24,sceneLine('M28 0 L67 0 M57 -8 L67 0 L57 8','gold')),point('team',352,192,'队'),point('team2',389,192,'队')],
    cues:sceneCue('charge',sceneLine('M250 125 L188 125 M198 117 L188 125 L198 133','ally')) + sceneCue('scan','<path class="scene-scan" d="M210 125 L270 65 A87 87 0 0 1 292 115 Z"/>' + sceneLabel(339,67,'扫描朝空地','gold')),
    steps:[
      {text:'观察首领面向与起身动作，判断前冲还是后冲。'},
      {text:'示例：首领向后冲，队员提前离开路径。',positions:{boss:[185,125]},cues:['charge']},
      {text:'冲锋结束后，主 T 将扇形扫描带向空地。',positions:{boss:[185,125]},cues:['scan']},
    ],
  },
  'witch-bomb': {
    background:sceneCircle(280,130,103) + sceneCircle(280,130,54,'boundary') + sceneLine('M280 130 L207 56','hazard') + sceneLabel(119,54,'不祥气息','hazard') + sceneLabel(132,222,'蜘蛛组') + sceneLabel(451,222,'空处示例'),
    actors:[point('boss',280,130,'首领','boss',24),point('bomb',315,164,'弹','hazard'),point('candidate',270,180,'候'),point('spider',188,191,'蛛'),point('team',350,85,'队')],
    cues:sceneCue('escape',sceneLine('M330 176 L410 204 M399 195 L410 204 L395 207','hazard')),
    steps:[
      {text:'中圈候选位看到提示，先确认谁被标记。'},
      {text:'炸弹位观察危险线、队友和其他炸弹的位置。'},
      {text:'向约定空处撤离，别穿过人群或蜘蛛组。',positions:{bomb:[410,204]},cues:['escape']},
    ],
  },
  'witch-spiders': {
    background:sceneLabel(142,45,'场地中央','gold') + sceneLabel(399,45,'一个处理区示例','gold'),
    actors:[point('boss',142,125,'首领','boss',24),point('big',355,125,'大','boss',23),point('s1',437,76,'小','hazard',13),point('s2',459,165,'小','hazard',13),point('s3',394,205,'小','hazard',13),point('team',325,186,'队')],
    cues:sceneCue('gather',sceneLine('M426 92 L385 112 M395 103 L385 112 L398 113','ally')) + sceneCue('interrupt',sceneLine('M326 125 L179 125 M189 117 L179 125 L189 133','hazard') + sceneLabel(251,93,'转向首领 · 打断','hazard')),
    steps:[
      {text:'飞天后按团队分点，先接住各区大蜘蛛。'},
      {text:'聚怪位将小蜘蛛带到大蜘蛛附近，再集中处理。',positions:{s1:[385,90],s2:[395,144],s3:[367,168]},cues:['gather']},
      {text:'大蜘蛛转向首领准备回血时，及时控制打断。',positions:{s1:[385,90],s2:[395,144],s3:[367,168]},cues:['interrupt']},
    ],
  },
  'witch-wave': {
    background:sceneCircle(245,130,95) + sceneLabel(423,199,'远点位'),
    actors:[point('boss',245,130,'首领','boss',24),point('team',207,176,'队'),point('far',422,130,'远')],
    cues:sceneCue('wave','<path class="scene-wave" d="M280 83 Q312 130 280 177"/>') + sceneCue('arrive','<path class="scene-wave" d="M388 74 Q420 130 388 186"/>') + sceneCue('jump',sceneLine('M422 113 L422 77 M415 87 L422 77 L429 87','ally')+sceneLabel(474,82,'起跳','gold')),
    steps:[
      {text:'后期远点位观察首领的出招预兆。'},
      {text:'震荡波出现，留意波纹接近自己的时机。',cues:['wave']},
      {text:'波纹到达时起跳规避；时机以场内显示为准。',positions:{far:[422,100]},cues:['arrive','jump']},
    ],
  },
};

function sequenceSvg(key) {
  const scene = RAID_SEQUENCES[key];
  return `<svg class="sequence-svg" viewBox="0 0 560 270" role="img" aria-label="机制站位及移动顺序示意">${scene.background}${scene.cues || ''}${scene.actors.map(sceneActor).join('')}</svg>`;
}
function drawSequenceDiagram(key, caption) {
  const scene = RAID_SEQUENCES[key];
  return `<figure class="raid-diagram sequence-diagram" data-sequence="${key}" data-step="0"><div class="diagram-top"><span>机制动态演示</span><div class="diagram-controls"><button type="button" class="diagram-pause" data-action="toggle-diagram-motion" aria-pressed="false">暂停</button><button type="button" class="diagram-zoom" data-action="zoom-diagram" aria-label="放大查看机制示意图"><svg class="icon" aria-hidden="true"><use href="#icon-zoom"/></svg>放大</button></div></div>${sequenceSvg(key)}<div class="sequence-readout"><span class="sequence-count" data-step-count>01 / ${String(scene.steps.length).padStart(2,'0')}</span><span data-step-text>${scene.steps[0].text}</span><div class="sequence-controls"><button type="button" data-action="sequence-prev" aria-label="上一步">←</button><button type="button" data-action="sequence-next" aria-label="下一步">→</button></div></div><figcaption><span>${caption}</span><span class="diagram-motion-note">动画演示处理顺序；站位、路线和时机以团队安排及场内情况为准。</span></figcaption></figure>`;
}
function drawOverviewSequence(key) {
  const scene = RAID_SEQUENCES[key];
  return `<div class="overview-sequence" data-sequence="${key}" data-step="0">${sequenceSvg(key)}<div class="overview-readout"><span data-step-count>01 / ${String(scene.steps.length).padStart(2,'0')}</span><span data-step-text>${scene.steps[0].text}</span></div></div>`;
}
