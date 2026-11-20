// Supplementary encounters are kept outside the scored question bank.
const GUARD_GUIDES = {
  twins: `<details class="guard-card"><summary><span><small>EN ROUTE / 看门怪补充</small><strong>金银童：稳住双目标，及时清小怪</strong></span><b aria-hidden="true">＋</b></summary>
    <section class="guard-encounter"><div class="guard-content">
      <figure class="guard-figure"><svg viewBox="60 0 360 250" role="img" aria-label="金银童同场，出现小怪时集中控制和清理，注意避开地面攻击">
        <circle class="guard-arena" cx="240" cy="123" r="104"/>
        <path class="guard-telegraph" d="M162 123 L78 92 L67 119 L158 150 Z"/>
        <circle class="guard-enemy guard-gold" cx="187" cy="113" r="25"/><text x="187" y="119" text-anchor="middle">金</text>
        <circle class="guard-enemy guard-silver" cx="293" cy="113" r="25"/><text x="293" y="119" text-anchor="middle">银</text>
        <circle class="guard-add" cx="217" cy="171" r="13"/><circle class="guard-add" cx="250" cy="181" r="13"/><circle class="guard-add" cx="281" cy="169" r="13"/>
        <text class="guard-label" x="249" y="216" text-anchor="middle">出现小怪时优先处理</text><text class="guard-label" x="78" y="77">地面预警</text>
      </svg><figcaption>双目标同场 · 小怪出现时集中处理</figcaption></figure>
      <div class="guard-copy">
        <div class="guard-point"><span class="guard-point-number" aria-hidden="true">01</span><div><h3>确认双目标</h3><p>金童、银童同时在场。等队友就位后开战，主 T 稳住仇恨，按指挥集中输出；两只分开时重新确认各自的位置。</p></div></div>
        <div class="guard-point"><span class="guard-point-number" aria-hidden="true">02</span><div><h3>先处理小怪</h3><p>场上出现小怪时，按团队安排集中控制、击杀，避免小怪积累后一起攻击；处理完再继续输出金银童。</p></div></div>
        <div class="guard-point guard-point-danger"><span class="guard-point-number" aria-hidden="true">03</span><div><h3>躲开攻击预警</h3><p>留意怪物面向和地面矩形提示，及时避开，主 T 被击退后尽快稳住位置。</p></div></div>
      </div>
    </div></section></details>`,
  spirit: `<details class="guard-card"><summary><span><small>EN ROUTE / 看门怪补充</small><strong>东方朔与血魔灵：状态衔接、拉断连线</strong></span><b aria-hidden="true">＋</b></summary>
    <section class="guard-encounter"><header class="guard-encounter-heading"><span>01</span><div><small>东方朔</small><h3>分批处理暗魔灵</h3></div></header><div class="guard-content">
      <figure class="guard-figure"><svg viewBox="60 0 360 250" role="img" aria-label="东方朔在场地中央，暗魔灵分批击杀，留意队员和首领的灵魂损伤">
        <circle class="guard-arena" cx="240" cy="123" r="104"/>
        <circle class="guard-enemy guard-gold" cx="240" cy="112" r="27"/><text x="240" y="118" text-anchor="middle">朔</text>
        <circle class="guard-add guard-add-pulse" cx="164" cy="151" r="17"/><circle class="guard-add" cx="314" cy="151" r="17"/>
        <path class="guard-route" d="M181 156 Q240 189 297 156"/>
        <text class="guard-label" x="240" y="220" text-anchor="middle">分批击杀 · 衔接灵魂损伤</text>
        <text class="guard-label" x="164" y="123" text-anchor="middle">暗魔灵</text><text class="guard-label" x="314" y="123" text-anchor="middle">暗魔灵</text>
      </svg><figcaption>暗魔灵的数量与站位以场内为准</figcaption></figure>
      <div class="guard-copy">
        <div class="guard-point"><span class="guard-point-number" aria-hidden="true">01</span><div><h3>稳住仇恨和位置</h3><p>主 T 稳住首领，按团队安排限制其移动，避免追到场边导致脱战。</p></div></div>
        <div class="guard-point"><span class="guard-point-number" aria-hidden="true">02</span><div><h3>分批接续状态</h3><p>暗魔灵出现后分批击杀，观察东方朔身上的灵魂损伤并接续处理；不要把小怪同时打完，造成状态中断。</p></div></div>
        <div class="guard-point guard-point-danger"><span class="guard-point-number" aria-hidden="true">03</span><div><h3>兼顾队伍血量</h3><p>灵魂损伤也会让队员持续掉血。留意自身状态和血量，及时自保、治疗。</p></div></div>
      </div>
    </div></section>
    <section class="guard-encounter"><header class="guard-encounter-heading"><span>02</span><div><small>血魔灵</small><h3>被连线就向外拉断</h3></div></header><div class="guard-content">
      <figure class="guard-figure"><svg viewBox="60 0 360 250" role="img" aria-label="血魔灵连线点名玩家，玩家向远离首领的空处移动直到连线消失，同时避开地面红圈">
        <circle class="guard-arena" cx="240" cy="122" r="104"/><circle class="guard-danger guard-danger-one" cx="177" cy="76" r="24"/><circle class="guard-danger guard-danger-two" cx="226" cy="182" r="24"/>
        <line class="guard-curse-line" x1="240" y1="122" x2="318" y2="122"/>
        <path class="guard-run-path" d="M320 152 H394 m-9 -8 9 8 -9 8"/>
        <circle class="guard-enemy" cx="240" cy="122" r="27"/><text x="240" y="128" text-anchor="middle">怪</text>
        <g class="guard-runner"><circle class="guard-player" cx="318" cy="122" r="16"/><text x="318" y="128" text-anchor="middle">人</text></g>
        <text class="guard-label" x="355" y="181" text-anchor="middle">向外拉断</text><text class="guard-label" x="90" y="45">避开红圈</text>
      </svg><figcaption>点名连线 · 向远离首领的空处移动</figcaption></figure>
      <div class="guard-copy">
        <div class="guard-point"><span class="guard-point-number" aria-hidden="true">01</span><div><h3>点名后向外拉</h3><p>被诅咒连线的玩家离开首领，朝空处移动，直到连线消失，再回到队伍位置。</p></div></div>
        <div class="guard-point guard-point-danger"><span class="guard-point-number" aria-hidden="true">02</span><div><h3>同时避开红圈</h3><p>拉线途中留意脚下预警和队友位置，不要为了输出停在线内；其他人给被点名者留出移动空间。</p></div></div>
      </div>
    </div></section></details>`,
  witch: `<details class="guard-card"><summary><span><small>EN ROUTE / 看门怪补充</small><strong>玄冥二老与三破战士：回血与跳中</strong></span><b aria-hidden="true">＋</b></summary>
    <section class="guard-encounter"><header class="guard-encounter-heading"><span>01</span><div><small>玄冥二老</small><h3>留意两怪回血</h3></div></header><div class="guard-content">
      <figure class="guard-figure"><svg viewBox="60 0 360 250" role="img" aria-label="玄冥二老同时在场，留意两只靠近后的回血，按分工分开或控制后绕背输出">
        <circle class="guard-arena" cx="240" cy="122" r="104"/>
        <circle class="guard-enemy guard-silver" cx="204" cy="112" r="26"/><circle class="guard-enemy" cx="276" cy="112" r="26"/>
        <text x="204" y="118" text-anchor="middle">玄</text><text x="276" y="118" text-anchor="middle">冥</text>
        <path class="guard-run-path" d="M171 170 h-42 m8 -7 -8 7 8 7 M309 170 h42 m-8 -7 8 7 -8 7"/>
        <text class="guard-label" x="240" y="216" text-anchor="middle">留意回血 · 稳住仇恨</text>
      </svg><figcaption>两只同场 · 处理间距和控制</figcaption></figure>
      <div class="guard-copy">
        <div class="guard-point"><span class="guard-point-number" aria-hidden="true">01</span><div><h3>等队伍到齐再开</h3><p>两只同时作战，击退和控制较多。先确认仇恨与控制安排，避免有人单独开怪。</p></div></div>
        <div class="guard-point"><span class="guard-point-number" aria-hidden="true">02</span><div><h3>发现回血及时处理</h3><p>两只贴近时会互相回血；可以分开拉，或按团队安排控制后绕背集中输出，留意血量变化。</p></div></div>
      </div>
    </div></section>
    <section class="guard-encounter"><header class="guard-encounter-heading"><span>02</span><div><small>三破战士</small><h3>分组稳位，跳中时保护</h3></div></header><div class="guard-content">
      <figure class="guard-figure"><svg viewBox="60 0 360 250" role="img" aria-label="三破战士分组应对，一只跳到场地中央时，全队准备保护，其他人同时注意各自目标和地面火圈">
        <circle class="guard-arena" cx="240" cy="120" r="104"/><circle class="guard-flame guard-center-blast" cx="240" cy="120" r="63"/>
        <circle class="guard-enemy" cx="171" cy="82" r="20"/><circle class="guard-enemy" cx="309" cy="82" r="20"/>
        <text x="171" y="88" text-anchor="middle">1</text><text x="309" y="88" text-anchor="middle">3</text>
        <g class="guard-jumper"><circle class="guard-enemy" cx="240" cy="120" r="21"/><text x="240" y="126" text-anchor="middle">2</text></g>
        <circle class="guard-danger" cx="316" cy="167" r="17"/><text class="guard-label" x="240" y="216" text-anchor="middle">一只跳中 · 全队准备保护</text>
      </svg><figcaption>其他目标仍在攻击 · 同时留意火圈</figcaption></figure>
      <div class="guard-copy">
        <div class="guard-point"><span class="guard-point-number" aria-hidden="true">01</span><div><h3>分配目标与保护</h3><p>按团队安排分组应对三只战士，提前排好御剑、蒲公英等保护技能的轮换。</p></div></div>
        <div class="guard-point guard-point-danger"><span class="guard-point-number" aria-hidden="true">02</span><div><h3>跳中时全队注意</h3><p>一只战士跳向场中央准备大范围攻击时，按指挥使用保护或自保；其他战士仍会攻击，继续避开脚下火圈。</p></div></div>
        <div class="guard-point"><span class="guard-point-number" aria-hidden="true">03</span><div><h3>关注血量与状态</h3><p>留意自身受击层数和三只怪物的血量，血量差距较大时听指挥调整目标，避免追怪扰乱站位。</p></div></div>
      </div>
    </div></section></details>`
};
