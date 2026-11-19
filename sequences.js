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
// A persistent field gives every frame the same spatial reference. Positions are illustrative.
const twinField = () => sceneCircle(142,130,91) + sceneCircle(418,130,91) +
  '<path d="M280 25v210" class="scene-river"/>' +
  sceneLabel(142,24,'灼热剑侧','gold') + sceneLabel(418,24,'酷寒剑侧','gold') + sceneLabel(280,256,'河道');
const arenaField = () => sceneCircle(280,133,108) + sceneLabel(280,258,'同一场地 · 位置示意');
const RAID_SEQUENCES = {
  'twins-distance': {
    background: sceneCircle(145,125,65,'fire-boundary') + sceneCircle(414,125,65,'boundary') + '<path d="M280 25v195" class="scene-river"/>' + sceneLabel(145,234,'灼热剑侧') + sceneLabel(414,234,'酷寒剑侧') + sceneLabel(280,253,'河道'),
    actors: [point('fire',145,125,'火','hazard',25),point('ice',414,125,'冰','ally',25),point('ft',52,125,'T','hazard'),point('it',455,125,'T')],
    cues: sceneCue('knock', sceneLine('M455 125 L512 125 M502 118 L512 125 L502 132','hazard') + sceneLabel(507,171,'击退')) + sceneCue('return', sceneLine('M500 125 L461 125 M471 118 L461 125 L471 132','ally')),
    steps: [
      {text:'火 T 在约 8 米外，冰 T 靠近冰首领。'},
      {text:'冰 T 被击退后，先确认身边的安全方向。', positions:{it:[510,125]}, cues:['knock']},
      {text:'冰 T 尽快回到首领附近；火 T 保持距离。', cues:['return']},
    ],
  },
  'twins-orbs': {
    background: twinField() + sceneLabel(78,55,'火球') + sceneLabel(206,216,'冰球') + sceneLabel(354,55,'火球') + sceneLabel(482,216,'冰球'),
    actors: [point('fire',142,130,'火','hazard',23),point('ice',418,130,'冰','ally',23),point('fball',78,72,'','hazard',9),point('iball',206,189,'','ally',9),point('fball2',354,72,'','hazard',9),point('iball2',482,189,'','ally',9),point('block',67,138,'挡','hazard',14),point('heal',215,142,'疗','ally',14),point('block2',492,138,'挡','ally',14),point('heal2',344,142,'疗','hazard',14)],
    cues: sceneCue('block', sceneLabel(142,231,'同色挡球','gold')+sceneLabel(418,231,'同色挡球','gold')) + sceneCue('heal', sceneLabel(142,231,'异色治疗位','gold')+sceneLabel(418,231,'异色治疗位','gold')),
    steps: [
      {text:'两侧各认首领颜色，确认同色挡球与异色治疗岗位。'},
      {text:'两侧分别处理同色球：火侧接火球，冰侧接冰球。',positions:{block:[78,94],block2:[482,166]},cues:['block']},
      {text:'治疗位按分工准备异色状态；两侧各自关注球路。',positions:{block:[78,94],block2:[482,166],heal:[206,166],heal2:[354,94]},cues:['heal']},
    ],
  },
  'twins-heal': {
    background: twinField(),
    actors:[point('fire',142,133,'火','hazard',23),point('ice',418,133,'冰','ally',23),
      point('ft',142,177,'T','hazard',15),point('it',418,177,'T','ally',15),
      point('flower1',80,77,'花','hazard',14),point('flower2',480,77,'花','ally',14),
      point('pearl1',80,77,'珠','ally',13),point('pearl2',480,77,'珠','ally',13),
      point('step1',67,180,'踩','hazard',14),point('step2',493,180,'踩','ally',14),
      point('heal1',200,181,'疗','ally',14),point('heal2',360,181,'疗','ally',14)],
    cues:sceneCue('flower',sceneLabel(142,224,'同色踩花','gold')+sceneLabel(418,224,'同色踩花','gold')) +
      sceneCue('pearl',sceneLabel(142,224,'异色位拾珠','gold')+sceneLabel(418,224,'异色位拾珠','gold')) +
      sceneCue('lift',sceneLabel(142,56,'抓起主 T','gold')+sceneLabel(418,56,'抓起主 T','gold')+
        '<path d="M187 178 Q172 167 157 161 M373 178 Q388 167 403 161" class="scene-heal-beam"/>'+
        '<g class="scene-hits"><circle cx="117" cy="75" r="3"/><circle cx="134" cy="75" r="3"/><circle cx="151" cy="75" r="3"/><circle cx="168" cy="75" r="3"/></g>'+
        '<g class="scene-hits"><circle cx="393" cy="75" r="3"/><circle cx="410" cy="75" r="3"/><circle cx="427" cy="75" r="3"/><circle cx="444" cy="75" r="3"/></g>'+
        sceneLabel(142,224,'治疗指向本侧 T','gold')+sceneLabel(418,224,'治疗指向本侧 T','gold')),
    steps:[
      {text:'两侧各自准备：主 T 留意同色状态，踩花位就位。',hidden:['pearl1','pearl2']},
      {text:'两侧的同色位分别踩花；两边进度以实战为准。',positions:{step1:[80,100],step2:[480,100]},hidden:['pearl1','pearl2'],cues:['flower']},
      {text:'花点处理后，异色治疗位拾取出现的治疗珠。',positions:{step1:[80,100],step2:[480,100],heal1:[105,102],heal2:[455,102]},hidden:['flower1','flower2'],cues:['pearl']},
      {text:'首领抓起主 T 连续攻击，治疗位对准本侧 T，接续抬血。',positions:{ft:[142,161],it:[418,161],heal1:[200,181],heal2:[360,181],step1:[80,100],step2:[480,100]},hidden:['flower1','flower2','pearl1','pearl2'],cues:['lift']},
    ],
  },
  'twins-swap': {
    background:sceneCircle(135,119,88)+sceneCircle(425,119,88)+'<path d="M280 26v206" class="scene-river"/>'+sceneLabel(135,25,'一侧')+sceneLabel(425,25,'另一侧')+sceneLabel(280,256,'河道 · 左右为相对位置'),
    actors:[point('fire',135,91,'火','hazard',23),point('ice',425,91,'冰','ally',23),point('ft',90,139,'T','hazard'),point('it',470,139,'T'),point('heal',92,191,'疗')],
    cues:sceneCue('swap',sceneLabel(280,58,'火首领 →  /  ← 冰首领','gold')) + sceneCue('heal',sceneLine('M115 192 L431 192 M421 184 L431 192 L421 200','ally')),
    steps:[
      {text:'一轮结束，先观察首领的换边与吸引动作。'},
      {text:'首领互换，同色位留意被吸后的落点。',positions:{fire:[425,91],ice:[135,91],ft:[470,139],it:[90,139]},cues:['swap']},
      {text:'吸人结束后，异色治疗位再自行过河。',positions:{fire:[425,91],ice:[135,91],ft:[470,139],it:[90,139],heal:[460,191]},cues:['heal']},
    ],
  },
  'spirit-select': {
    background:arenaField()+sceneCircle(280,128,66,'boundary')+sceneLabel(148,75,'远点业火组')+sceneLabel(438,205,'空处示例'),
    actors:[point('boss',280,128,'首领','boss',25),point('tank',239,166,'T'),point('a',200,72,'A','ally',14),point('b',182,127,'B','ally',14),point('c',200,182,'C','ally',14),point('bomb',321,98,'弹','hazard',15)],
    cues:sceneCue('bomb',sceneLine('M336 104 L370 165 M359 155 L370 165 L368 150','hazard')),
    steps:[
      {text:'业火组占远点，炸弹候选位靠近首领。'},
      {text:'近点被波动炸弹点名，先看清周围队员。'},
      {text:'被点名者撤向空处，同时业火组继续确认进场准备。',positions:{bomb:[370,165]},cues:['bomb']},
    ],
  },
  'spirit-facing': {
    background:arenaField()+sceneLabel(163,61,'业火位','gold')+sceneLabel(399,61,'外场位','gold'),
    actors:[point('boss',280,133,'首领','boss',25),point('fire',205,133,'火','hazard',20),point('outside',355,133,'外','ally',20)],
    cues:sceneCue('face',sceneLine('M226 133 L247 133 M239 127 L247 133 L239 139','hazard')+sceneLine('M376 133 L409 133 M401 127 L409 133 L401 139','ally')+sceneLabel(183,195,'面向首领 · 进隔离','hazard')+sceneLabel(384,195,'背对首领 · 留外场','gold')),
    steps:[
      {text:'击倒前确认身上有没有业火，报清谁进谁留。'},
      {text:'击倒切换时同时确认面向：进隔离的业火位面向首领，留外场的人背对。',cues:['face']},
      {text:'切换后确认各自状态，再按分工调整。',cues:['face']},
    ],
  },
  'spirit-lamps': {
    background:sceneCircle(280,130,98) + sceneLabel(280,255,'灯位与引导次序按团队安排')+sceneLabel(124,174,'隔离内','gold')+sceneLabel(441,174,'外场避让','gold'),
    actors:[point('boss',280,130,'首领','boss',24),point('tank',322,130,'T'),point('team',226,166,'内'),point('outer',334,199,'外','ally',14),point('l1',280,32,'灯','lamp',14),point('l2',365,81,'灯','lamp',14),point('l3',365,179,'灯','lamp',14),point('l4',280,228,'灯','lamp',14),point('l5',195,179,'灯','lamp',14),point('l6',195,81,'灯','lamp',14)],
    cues:sceneCue('first',sceneLine('M301 107 L343 82 M332 84 L343 82 L337 92','gold')) + sceneCue('second',sceneLine('M302 150 L343 177 M337 167 L343 177 L331 175','gold')),
    steps:[
      {text:'染灯与隔离同时进行：主 T 认灯位，隔离内队员注意躲避。'},
      {text:'主 T 引导攻击覆盖灯位，同时内场躲斩击、炸弹和地面攻击。',positions:{tank:[317,105]},cues:['first']},
      {text:'继续按团队路线处理灯位；外场让开引导方向。',positions:{tank:[317,155]},cues:['second']},
    ],
  },
  'spirit-rotation': {
    background:arenaField()+sceneLabel(111,72,'A 组','gold')+sceneLabel(449,72,'B 组','gold')+
      sceneLabel(111,220,'状态示意')+sceneLabel(449,220,'状态示意'),
    actors:[point('boss',280,133,'首领','boss',25),point('tank',314,166,'T','ally',15),point('a',200,133,'A','hazard',20),point('b',360,133,'B','ally',20)],
    cues:sceneCue('before',sceneLabel(123,145,'隔离内','hazard')+sceneLabel(436,145,'外场待命','gold'))+
      sceneCue('switch',sceneLabel(123,145,'出隔离','hazard')+sceneLabel(436,145,'进隔离','gold')+sceneLabel(280,65,'同一次击倒窗口','gold')+
        '<circle cx="200" cy="133" r="24" class="scene-transition-ring"/><circle cx="360" cy="133" r="24" class="scene-transition-ring"/>')+
      sceneCue('after',sceneLabel(123,145,'外场 · 后遗症','hazard')+sceneLabel(436,145,'隔离内','gold')),
    steps:[
      {text:'A 组在隔离内，B 组在外场准备；这是同一场地的不同状态。',cues:['before']},
      {text:'击倒切换时，A 组出隔离，符合条件的 B 组同时接替进场。',cues:['switch']},
      {text:'A 组留意约 30 秒后遗症，B 组处理隔离内机制。',cues:['after']},
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
    background:arenaField()+sceneLine('M280 130 L211 47','hazard')+sceneLabel(126,57,'后冲示例')+sceneLabel(435,207,'队友安全侧'),
    actors:[point('boss',280,125,'首领','boss',24,sceneLine('M28 0 L67 0 M57 -8 L67 0 L57 8','gold')),point('tank',314,81,'T'),point('team',352,192,'队'),point('team2',389,192,'队')],
    cues:sceneCue('charge',sceneLine('M250 125 L188 125 M198 117 L188 125 L198 133','ally')) + sceneCue('scan','<path class="scene-scan" d="M210 125 L270 65 A87 87 0 0 1 292 115 Z"/>' + sceneLabel(339,67,'扫描朝空地','gold')),
    steps:[
      {text:'观察首领面向与起身动作，判断前冲还是后冲。'},
      {text:'示例：首领向后冲，主 T 看落点与危险线，队员提前离开路径。',positions:{boss:[185,125],tank:[231,81]},cues:['charge']},
      {text:'冲锋结束后，主 T 将扇形扫描带向空地。',positions:{boss:[185,125],tank:[231,81]},cues:['scan']},
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
    background:arenaField()+sceneLabel(375,45,'一个分点示例','gold'),
    actors:[point('boss',280,133,'首领','boss',23),point('tank',250,178,'T','ally',14),point('bomb',310,78,'弹','hazard',14),point('big',343,132,'大','boss',18),point('s1',361,76,'小','hazard',12),point('s2',372,160,'小','hazard',12),point('s3',350,194,'小','hazard',12),point('team',316,196,'队','ally',15)],
    cues:sceneCue('flying',sceneLabel(280,131,'首领飞天','gold')+sceneLabel(280,151,'暂离地面'))+
      sceneCue('gather',sceneLine('M355 90 L349 110 M345 101 L349 110 L357 102','ally'))+
      sceneCue('interrupt',sceneLine('M325 132 L307 132 M315 125 L307 132 L315 139','hazard') + sceneLabel(428,170,'面向首领 · 打断','hazard') + sceneLine('M280 133 L211 50','hazard')),
    steps:[
      {text:'飞天时首领暂离地面，蜘蛛组按团队分点接怪。',hidden:['boss','tank','bomb'],cues:['flying']},
      {text:'聚怪位将小蜘蛛带到大蜘蛛附近，再集中处理。',positions:{s1:[355,102],s2:[367,149],s3:[341,166]},hidden:['boss','tank','bomb'],cues:['flying','gather']},
      {text:'41% 落地后首领与蜘蛛可同场：打断回血，同时兼顾带位和炸弹。',positions:{s1:[355,102],s2:[367,149],s3:[341,166]},cues:['interrupt']},
    ],
  },
  'witch-wave': {
    background:arenaField()+sceneLine('M280 133 L211 50','hazard')+sceneLabel(420,187,'远点位'),
    actors:[point('boss',280,133,'首领','boss',24),point('team',245,174,'队'),point('far',360,133,'远')],
    cues:sceneCue('wave','<path class="scene-wave" d="M313 92 Q342 133 313 174"/>') + sceneCue('arrive','<path class="scene-wave" d="M337 80 Q376 133 337 186"/>') + sceneCue('jump',sceneLabel(425,105,'↑ 起跳','gold')),
    steps:[
      {text:'后期远点位观察首领的出招预兆。'},
      {text:'震荡波出现，留意波纹接近自己的时机。',cues:['wave']},
      {text:'波纹到达时起跳规避；起跳提示不代表平面移动。',cues:['arrive','jump']},
    ],
  },
  // The covers reuse the same labelled actors as the larger tactical maps.
  'overview-twins': {
    background: twinField(),
    actors: [point('fire',142,130,'火','hazard',24),point('ice',418,130,'冰','ally',24),
      point('ft',142,184,'T','hazard',15),point('it',418,184,'T','ally',15),
      point('fh',79,182,'疗','ally',15),point('ih',481,182,'疗','ally',15)],
    cues: sceneCue('lift', sceneLabel(142,61,'主 T 被抓','gold')+sceneLabel(418,61,'主 T 被抓','gold')+
      '<path d="M93 170 Q113 144 130 103 M467 170 Q447 144 430 103" class="scene-heal-beam"/>')+
      sceneCue('hits',sceneLabel(142,222,'三、四刀注意大加','gold')+sceneLabel(418,222,'三、四刀注意大加','gold')),
    steps: [
      {text:'两侧分别确认主 T 与治疗位。'},
      {text:'主 T 被抓起时，两侧治疗同时对准各自主 T。',positions:{ft:[142,88],it:[418,88]},cues:['lift']},
      {text:'连续四刀期间稳住血量，第三、第四刀准备大加。',positions:{ft:[142,88],it:[418,88]},cues:['lift','hits']},
    ],
  },
  'overview-spirit': {
    background: sceneCircle(280,130,100),
    actors: [point('boss',280,130,'首领','boss',23),point('tank',308,166,'T','ally',15),
      point('a',98,68,'火','ally',14),point('b',80,125,'火','ally',14),point('c',98,182,'火','ally',14),
      point('bomb',316,103,'弹','hazard',15),point('inside',224,158,'内','ally',14)],
    cues: sceneCue('select',sceneLabel(96,222,'远点业火','gold')+sceneLabel(414,85,'近点炸弹','hazard'))+
      sceneCue('escape',sceneLine('M335 111 L417 181 M408 170 L417 181 L402 178','hazard'))+
      sceneCue('lamps',sceneLabel(118,74,'隔离内','gold')+sceneLabel(421,75,'主 T 引灯','gold')+
        [ [280,30],[367,80],[367,180],[280,230],[193,180],[193,80] ].map(([x,y]) =>
          `<circle cx="${x}" cy="${y}" r="9" class="scene-piece lamp"/>`).join('')+
        sceneLine('M302 112 L354 82 M342 82 L354 82 L348 91','gold')),
    steps: [
      {text:'业火与炸弹同时点名：远点接业火，近点认炸弹。',hidden:['inside'],cues:['select']},
      {text:'炸弹位向空处撤离，业火组继续准备隔离。',positions:{bomb:[420,184]},hidden:['inside'],cues:['select','escape']},
      {text:'染灯与隔离同时进行：主 T 引灯，内场继续躲避。',positions:{tank:[321,103]},hidden:['a','b','c','bomb'],cues:['lamps']},
    ],
  },
  'overview-witch': {
    background: sceneCircle(280,130,104) + '<g class="overview-danger-ray">'+sceneLine('M280 130 L206 56','hazard')+'</g>'+
      sceneLabel(104,52,'不祥气息','hazard'),
    actors: [point('boss',315,154,'首领','boss',24),point('tank',360,170,'T','ally',15),
      point('team',295,203,'队','ally',15),point('bomb',335,105,'弹','hazard',15)],
    cues: sceneCue('withdraw',sceneLine('M348 115 L422 189 M410 184 L422 189 L418 176','hazard')+sceneLabel(443,245,'空处','gold')),
    steps: [
      {text:'主 T 留意不祥气息，带首领保持距离。'},
      {text:'炸弹被点名后避开队友，向约定空处撤离。',positions:{bomb:[424,192]},cues:['withdraw']},
      {text:'带位与炸弹同时处理，落点和路线以现场为准。',positions:{bomb:[424,192],boss:[302,169],tank:[347,187]},cues:['withdraw']},
    ],
  },
};

function sequenceSvg(key) {
  const scene = RAID_SEQUENCES[key];
  return `<svg class="sequence-svg" viewBox="0 0 560 270" role="img" aria-label="机制站位及移动顺序示意">${scene.background}${scene.cues || ''}${scene.actors.map(sceneActor).join('')}</svg>`;
}
function drawSequenceDiagram(key, caption) {
  const scene = RAID_SEQUENCES[key];
  return `<figure class="raid-diagram sequence-diagram" data-sequence="${key}" data-step="0"><div class="diagram-top"><span>机制动态演示</span><div class="diagram-controls"><button type="button" class="diagram-pause" data-action="toggle-diagram-motion" aria-pressed="false">暂停</button><button type="button" class="diagram-zoom" data-action="zoom-diagram" aria-label="放大查看机制示意图"><svg class="icon" aria-hidden="true"><use href="#icon-zoom"/></svg>放大</button></div></div><div class="diagram-canvas">${sequenceSvg(key)}</div><div class="sequence-readout"><span class="sequence-count" data-step-count>01 / ${String(scene.steps.length).padStart(2,'0')}</span><span data-step-text>${scene.steps[0].text}</span><div class="sequence-controls"><button type="button" data-action="sequence-prev" aria-label="上一步">←</button><button type="button" data-action="sequence-next" aria-label="下一步">→</button></div></div><figcaption><span>${caption}</span><span class="diagram-motion-note">画面突出关键动作；可能同时发生的机制需一起留意，位置与时机以实战为准。</span></figcaption></figure>`;
}
function drawOverviewSequence(key) {
  const overview = {
    'twins-orbs': ['overview-twins','双剑 · 抬血','__ENCOUNTER_TWINS__'],
    'spirit-select': ['overview-spirit','超魔灵 · 同步分工','__ENCOUNTER_SPIRIT__'],
    'witch-bomb': ['overview-witch','黑风魔女 · 带位与炸弹','__ENCOUNTER_WITCH__'],
  }[key];
  if (!overview) return '';
  const [id, title, art] = overview;
  const scene = RAID_SEQUENCES[id];
  return `<div class="chapter-art" data-sequence="${id}" data-step="0" aria-label="${title}">
    <div class="chapter-scene"><img class="chapter-scene-image" src="${art}" alt="" aria-hidden="true" decoding="async" loading="lazy">${sequenceSvg(id)}</div>
    <div class="chapter-status"><span class="chapter-counter" data-step-count>01 / ${String(scene.steps.length).padStart(2,'0')}</span><span class="chapter-status-text" data-step-text>${scene.steps[0].text}</span></div>
    <div class="chapter-playback"><div class="chapter-progress"><span>动态示意</span><i></i><i></i><i></i></div><div class="chapter-step-controls"><button type="button" class="diagram-pause" data-action="toggle-diagram-motion" aria-pressed="false">暂停</button><button type="button" data-action="sequence-prev" aria-label="${title}上一步">←</button><button type="button" data-action="sequence-next" aria-label="${title}下一步">→</button></div></div>
  </div>`;
}

if (typeof module !== 'undefined' && module.exports) module.exports = {RAID_SEQUENCES};
