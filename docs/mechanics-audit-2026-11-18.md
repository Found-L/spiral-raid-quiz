# 螺旋寺院题库核对记录（2026-11-18）

## 范围与证据限制

本次核对仅使用螺旋寺院在巅峰服上线后的玩家讲解、用户提供的巅峰服实战反馈，以及 2026-11-18 巅峰服客户端数据快照。视频口述或自动转录可能有误，客户端中存在记录也不单独证明它一定在当前战斗中生效。下表为逐题对照入口；它不表示 87 道题都已在游戏中逐一实测。具体数值有疑问时，不以未经确认的数字作为唯一答案。

## 2026-11-19：双剑抬血与场地参照复核

- 用户确认“抬”指首领抓起主 T 后的抬血。上线后的巅峰服讲解在 [01:53](https://www.bilibili.com/video/BV1d9n265EyM/?t=113)、[02:44](https://www.bilibili.com/video/BV1d9n265EyM/?t=164) 提及主 T 被抓或挑起，并由治疗位加血；[03:13](https://www.bilibili.com/video/BV1d9n265EyM/?t=193) 提及绿色治疗指示需对准主 T。另一份巅峰服讲解 [03:09](https://www.bilibili.com/video/BV15uny6qENV/?t=189) 讲解四刀和治疗分工。这里的四刀闪动只是计数演示，不是实战出刀间隔。
- q014—q017、q020、q024 原本覆盖治疗目标及四刀配合，但没有直接说明“被抓起”的触发场景；新增 q103 连接主 T 被抓与本侧治疗。v8 完整归档，v9 仅增加这一题，旧答卷和未交卷答案仍按版本兼容。
- 双剑踩花、拾珠和抬血重新放回含河道与两名首领的全场示意。两侧各自处理，实际进度和花点位置以场内为准；换边图保留固定河道参照，并用文字明确首领方向。
- 超魔灵隔离内外属于同一场地的状态，原来两个并排圆圈和横向箭头容易误导为两个房间，已改为同一首领参照与 A／B 状态切换；业火进场与外场队员留场在同一击倒窗口同时标示。染灯画面同时保留隔离内、外场角色，不能只看其中一套机制。
- 魔女冲锋、蜘蛛和震荡波图增加场地和首领参照。蜘蛛图为一个分点的示意，并非所有出生点；第二次落地后可与首领同场。跳跃符号只提示垂直动作，不代表平面走位。
- 对现有三位首领上线后的讲解、用户反馈与客户端数据做了覆盖复核；这些资料不是每个技能的逐项实测，仍不足以证明不存在任何遗漏，也不足以推断固定站位、所有职业的规避方式或精确出刀间隔。

## 重点修订

2026-11-19 新增的 q095—q100 只将已记录的机制换成普通输出或治疗位的场景题：分别对照下表 q009／q019、q027／q028、q011、q042、q076、q070／q074。动画中危险线的旋转仅为示意，不给出未经核实的转向、速度或安全落点。新趣味勋章依具体错误选项触发，不改变机制答案。

- 第 11 题：原题把飞行中的碰撞和挡球／分球混为一谈。按用户反馈和客户端中对应球技能的区别，将题目改成只问飞行碰撞的风险，不再将其直接判定为换色。客户端数据中冰球飞行技能引用伤害及冻伤效果；冻伤记录可转为基础时长 5 秒的冰冻。静态记录无法单独证明每一次碰撞都会触发完整的 5 秒冰冻，也不能单独证明火状态层数与冻结的全部关系，故未将这些细节设为标准答案。
- 第 10、22 题：明确写成三层时误挡或误分异色球的风险；第 9、19 题和机制图解同步区分球路与分挡范围。第 12、13 题补充踩花及治疗的三层状态前提。
- 第 18 题：用户反馈持有异色状态误踩花点只会掉血，不会清除球体状态，与先前讲解中的说法相冲突。客户端 `GWD_VT_B1_FireFlower_Explosion` 与 `GWD_VT_B1_IceFlower_Explosion` 引用了伤害效果组，静态数据无法独立排除所有服务端分支。依据反馈将“清除状态”改为错误选项，图解改为提示受伤风险。
- 第 38 题：巅峰服客户端 `GWD_VT_B2_SorcererBoss_SoulBurn_Debuff` 的显示名称为“报应”，描述为攻击力大幅降低；其对应攻击力上下限的数值均为 -800，与用户收到的反馈一致。删除原来没有足够依据的“暴击伤害降低”。
- 第 39、40、49 题：客户端对应状态名为“后遗症”，基础时长 30 秒，文字说明后遗症期间进入灵魂隔离会死亡。题目和图解不再把它笼统描述为“不能进入”。
- 第 45 题：用户反馈约 90% 进入染灯后持续到约 14%，不是在 90%、60%、30% 分别进入；第二份上线后讲解也描述进入阶段后灯持续起作用。此前单一讲解把 90%、60%、30% 作为门槛，其说法不应在有冲突时作为唯一答案。不同资料提到约 12% 或 15% 的后期节点，未独立确认精确终止血量，因此题目不考该数字。
- 第 57、58、82、86 题：现有讲解中的冲锋台词与客户端文本不能逐字对上，改为考察动作、方向和安全落点，不把未经确认的台词字句当作唯一答案。
- 第 72 题：讲解者对大蜘蛛回血 2% 的语气并不确定，取消该数值题，改考控制与清怪配合。

第 37、53 题的约 5 秒来自上线后的超魔灵讲解，具体倒计时在游戏内显示和网络延迟下仍应以当前实战为准。团队分工、路线与治疗顺序属于打法，题目中的“按团队安排”等前提不能当作唯一固定打法。

历史成绩仅保存正确题数和总题数，没有逐题答案，无法对已上传的旧成绩重新评分。综合榜单保留每人最新已完成题库的最高分；完成新版后才用新版成绩替代旧版排名，历史记录仍保留。

## 2026-11-19：整张魔女试卷覆盖核对

- 不祥气息、主 T 带位与正反冲、炸弹撤离、71%／41% 飞天、蜘蛛分点和控制，已有 q055—q075、q078—q087 和 q092—q094 对应。普通输出、砸地与聚怪配合另见 q099—q100。
- 原试卷的 41% 后远点震荡波此前只有图解，没有直接的试题。q101—q102 补充最远位留意点名、观察时机起跳；对照巅峰服上线后的[讲解约 15:33](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=933) 和 [16:26](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=986) 中的后期实战口述。视频自动转录可能存在误识别，无法替代逐技能实测。
- 原试卷还涉及不祥气息具体转向、冲锋逐字台词、炸弹精确距离、所有蜘蛛清完是否为落地的必要条件、各职业抵抗能否躲震荡波等。现有巅峰服证据不足或存在冲突，因此没有把这些细节设为唯一标准答案；不能声称试卷每一道原题的细节均已覆盖。
- 最后的治疗位简答场景由 q006—q017、q025—q030 等分题覆盖治疗、挡球与换边，未把特定队伍的治疗编号和所有操作顺序固化为唯一打法。
- 旧 v7 题库完整归档，已有 100 题未变；未交卷进度保留原题顺序、选项顺序与答案，新加两题置于原题之后。旧题库待上传成绩仍按原题库评分。

## 逐题对照入口

时间点是开始查验相关内容的入口，可能需要结合前后片段；客户端与玩家反馈的细节以上述重点修订为准。

| 题号 | 题面所考内容 | 对照入口 |
| --- | --- | --- |
| q001 | 双剑常规阶段，酷寒剑主 T 被击退后，首先应该做什么？ | [查看 01:05](https://www.bilibili.com/video/BV15uny6qENV/?t=65) |
| q002 | 双剑挡球阶段，灼热剑主 T 漏球后，为什么不宜贴近首领追球？ | [查看 01:15](https://www.bilibili.com/video/BV15uny6qENV/?t=75) |
| q003 | 双剑挡球阶段，灼热剑主 T 应优先挡哪种球？ | [查看 01:31](https://www.bilibili.com/video/BV15uny6qENV/?t=91) |
| q004 | 按同样的分工，酷寒剑主 T 的同色球是哪种？ | [查看 01:31](https://www.bilibili.com/video/BV15uny6qENV/?t=91) |
| q005 | 双剑挡球阶段，同色协助位的主要任务是什么？ | [查看 02:07](https://www.bilibili.com/video/BV15uny6qENV/?t=127) |
| q006 | 双剑挡球阶段，酷寒剑一侧的治疗位应先处理哪种球来获得异色状态？ | [查看 02:26](https://www.bilibili.com/video/BV15uny6qENV/?t=146) |
| q007 | 双剑挡球阶段，灼热剑一侧的治疗位应先处理哪种球来获得异色状态？ | [查看 02:39](https://www.bilibili.com/video/BV15uny6qENV/?t=159) |
| q008 | 双剑挡球阶段，一个人单独挡到一个球时，通常获得几层对应状态？ | [查看 01:38](https://www.bilibili.com/video/BV15uny6qENV/?t=98) |
| q009 | 双剑挡球阶段，两个人共同挡到同一个球，通常各获得几层状态？ | [查看 01:42](https://www.bilibili.com/video/BV15uny6qENV/?t=102) |
| q010 | 双剑挡球阶段，已有三层冰状态的玩家误挡火球或参与火球分挡，有什么风险？ | [查看 02:57](https://www.bilibili.com/video/BV15uny6qENV/?t=177) |
| q011 | 双剑挡球阶段，已有两层火状态的玩家碰到飞行中的冰球，但没有挡球或分球，应如何判断？ | [查看 02:49](https://www.bilibili.com/video/BV15uny6qENV/?t=169)；客户端、玩家反馈 |
| q012 | 双剑球花阶段，承担踩花任务且已有三层同色状态的玩家，应如何处理对应花点？ | [查看 06:25](https://www.bilibili.com/video/BV15uny6qENV/?t=385) |
| q013 | 双剑球花阶段，已有三层异色状态的治疗位，等待同色位处理花点后应做什么？ | [查看 06:37](https://www.bilibili.com/video/BV15uny6qENV/?t=397) |
| q014 | 双剑治疗阶段，使用治疗珠加血时，绿色指示应对准谁？ | [查看 06:48](https://www.bilibili.com/video/BV15uny6qENV/?t=408) |
| q015 | 双剑四刀阶段，治疗位尤其需要为哪两刀准备较大的治疗量？ | [查看 03:10](https://www.bilibili.com/video/BV15uny6qENV/?t=190) |
| q016 | 双剑四刀阶段，团队已安排一名治疗位负责第三刀大加，其他治疗位此时应怎样配合？ | [查看 03:25](https://www.bilibili.com/video/BV15uny6qENV/?t=205) |
| q017 | 双剑四刀阶段，第四刀到来前治疗位应如何配合？ | [查看 03:34](https://www.bilibili.com/video/BV15uny6qENV/?t=214) |
| q018 | 双剑球花阶段，持有球体状态的玩家误踩与自身状态异色的花点，会有什么影响？ | [查看 09:14](https://www.bilibili.com/video/BV15uny6qENV/?t=554)；客户端、玩家反馈 |
| q019 | 双剑开打前，主 T 和挡球位应共同确认哪些事项？ | [查看 01:05](https://www.bilibili.com/video/BV15uny6qENV/?t=65) |
| q020 | 双剑治疗阶段，哪些做法有利于主 T 生存？ | [查看 03:09](https://www.bilibili.com/video/BV15uny6qENV/?t=189) |
| q021 | 酷寒剑主 T 被击退后，可以一直站在远离首领的位置等下一轮球。 | [查看 01:05](https://www.bilibili.com/video/BV15uny6qENV/?t=65) |
| q022 | 已有三层冰状态时，误挡火球或参与火球分挡仍然安全，可以忽略颜色。 | [查看 02:57](https://www.bilibili.com/video/BV15uny6qENV/?t=177) |
| q023 | 选择填空：双剑挡球阶段，灼热剑主 T 优先挡与首领____的球。 | [查看 01:31](https://www.bilibili.com/video/BV15uny6qENV/?t=91) |
| q024 | 选择填空：双剑四刀阶段，第三刀和第____刀需要特别关注大加。 | [查看 03:20](https://www.bilibili.com/video/BV15uny6qENV/?t=200) |
| q025 | 双剑一轮机制结束后，两个首领通常会怎样移动？ | [查看 02:02](https://www.bilibili.com/video/BV1d9n265EyM/?t=122) |
| q026 | 双剑换边阶段，主 T 和同色状态玩家通常如何转场？ | [查看 02:02](https://www.bilibili.com/video/BV1d9n265EyM/?t=122) |
| q027 | 双剑换边阶段，异色治疗位应怎样到达新位置？ | [查看 02:06](https://www.bilibili.com/video/BV1d9n265EyM/?t=126) |
| q028 | 双剑换边阶段，异色治疗位为什么不宜过早穿过吸人范围？ | [查看 02:11](https://www.bilibili.com/video/BV1d9n265EyM/?t=131) |
| q029 | 双剑换边阶段，哪些做法正确？ | [查看 02:02](https://www.bilibili.com/video/BV1d9n265EyM/?t=122) |
| q030 | 双剑换边时，异色治疗位应不看吸引动作，第一时间冲过河，否则一定无法治疗。 | [查看 02:11](https://www.bilibili.com/video/BV1d9n265EyM/?t=131) |
| q031 | 超魔灵业火点名时，通常选中距离首领最远的几名玩家？ | [查看 00:32](https://www.bilibili.com/video/BV1rFWY6REex/?t=32) |
| q032 | 超魔灵业火状态的倒计时约为多少？ | [查看 00:32](https://www.bilibili.com/video/BV1rFWY6REex/?t=32) |
| q033 | 超魔灵业火倒计时结束前没有按机制进入隔离，会有什么后果？ | [查看 00:38](https://www.bilibili.com/video/BV1rFWY6REex/?t=38) |
| q034 | 团队为超魔灵的三名业火点名位额外安排一名站位备份，主要目的是什么？ | [查看 00:46](https://www.bilibili.com/video/BV1rFWY6REex/?t=46) |
| q035 | 超魔灵波动炸弹通常点名谁？ | [查看 00:55](https://www.bilibili.com/video/BV1rFWY6REex/?t=55) |
| q036 | 超魔灵波动炸弹点名后，被点名者应如何处理？ | [查看 01:00](https://www.bilibili.com/video/BV1rFWY6REex/?t=60) |
| q037 | 超魔灵波动炸弹的反应倒计时约为多久？ | [查看 01:08](https://www.bilibili.com/video/BV1rFWY6REex/?t=68) |
| q038 | 超魔灵隔离阶段，不带业火进入隔离可能受到什么惩罚？ | [查看 01:11](https://www.bilibili.com/video/BV1rFWY6REex/?t=71)；客户端、玩家反馈 |
| q039 | 超魔灵隔离阶段，离开隔离后的后遗症状态约持续多久？ | [查看 01:24](https://www.bilibili.com/video/BV1rFWY6REex/?t=84)；客户端 |
| q040 | 超魔灵隔离阶段，队员离开后会有后遗症，应如何安排业火人员？ | [查看 01:24](https://www.bilibili.com/video/BV1rFWY6REex/?t=84)；客户端 |
| q041 | 超魔灵击倒切换时，准备进入隔离的业火玩家应怎样面向首领？ | [查看 02:04](https://www.bilibili.com/video/BV1rFWY6REex/?t=124) |
| q042 | 超魔灵击倒切换时，没有业火且需要留在外场的玩家应怎样面向首领？ | [查看 02:10](https://www.bilibili.com/video/BV1rFWY6REex/?t=130) |
| q043 | 超魔灵控制阶段，团队约定先眩晕后击倒，控制位应如何执行？ | [查看 01:43](https://www.bilibili.com/video/BV1rFWY6REex/?t=103) |
| q044 | 超魔灵控制阶段，眩晕没有及时接上时，外场可能多出什么需要躲避的机制？ | [查看 01:50](https://www.bilibili.com/video/BV1rFWY6REex/?t=110) |
| q045 | 超魔灵约 90% 血量进入染灯阶段后，主 T 应如何处理染灯？ | [查看 02:55（说法冲突）](https://www.bilibili.com/video/BV1rFWY6REex/?t=175)；玩家反馈，其他讲解有冲突 |
| q046 | 超魔灵染灯阶段，主 T 一轮需要处理多少盏灯？ | [查看 03:02](https://www.bilibili.com/video/BV1rFWY6REex/?t=182) |
| q047 | 主 T 染灯时，外场输出人员应注意什么？ | [查看 02:30](https://www.bilibili.com/video/BV1rFWY6REex/?t=150) |
| q048 | 超魔灵隔离内的队员应特别观察哪些危险？ | [查看 02:45](https://www.bilibili.com/video/BV1rFWY6REex/?t=165) |
| q049 | 超魔灵业火与隔离阶段，哪些处理方式正确？ | [查看 00:32](https://www.bilibili.com/video/BV1rFWY6REex/?t=32)；客户端 |
| q050 | 超魔灵处理波动炸弹时，团队应做到哪些？ | [查看 00:55](https://www.bilibili.com/video/BV1rFWY6REex/?t=55) |
| q051 | 带业火后，只要活着站在外面，倒计时结束也不会出事。 | [查看 00:38](https://www.bilibili.com/video/BV1rFWY6REex/?t=38) |
| q052 | 超魔灵染灯阶段，主 T 应让团队提前知道路线，其他人应避免挡在路线上。 | [查看 03:02](https://www.bilibili.com/video/BV1rFWY6REex/?t=182) |
| q053 | 选择填空：超魔灵波动炸弹约有____秒反应时间。 | [查看 01:08](https://www.bilibili.com/video/BV1rFWY6REex/?t=68) |
| q054 | 选择填空：超魔灵击倒切换时，带业火进入隔离的玩家应____首领。 | [查看 02:04](https://www.bilibili.com/video/BV1rFWY6REex/?t=124) |
| q055 | 黑风魔女常规阶段，玩家碰到场地中旋转的不祥气息可能造成什么后果？ | [查看 02:38](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=158) |
| q056 | 黑风魔女常规阶段，主 T 带位失误让首领碰到不祥气息，可能发生什么？ | [查看 06:00](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=360) |
| q057 | 黑风魔女击倒后准备向前冲锋，主 T 应重点观察什么？ | [查看 04:13](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=253)；客户端 |
| q058 | 黑风魔女击倒后准备向后冲锋，主 T 应如何处理？ | [查看 04:24](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=264)；客户端 |
| q059 | 处理完正冲或反冲后，主 T 应尽量把后续扇形扫描带向哪里？ | [查看 04:35](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=275) |
| q060 | 黑风魔女常规阶段，主 T 带首领跟随不祥气息移动时，怎样选择路线更合适？ | [查看 03:24](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=204) |
| q061 | 黑风魔女常规阶段，哪一组攻击循环正确？ | [查看 03:41](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=221) |
| q062 | 黑风魔女在常规控制点被击倒后，主 T 应准备应对什么？ | [查看 03:50](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=230) |
| q063 | 黑风魔女前两个阶段，团队约定以眩晕为主、由指挥安排击倒时，控制位应怎样做？ | [查看 03:12](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=192) |
| q064 | 黑风魔女后期首领与蜘蛛同场，团队要求适当增加击倒控制节奏时，控制位应怎样做？ | [查看 03:12](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=192) |
| q065 | 黑风魔女常规阶段，需要安排中圈人员承担炸弹点名，下列哪种分工更合适？ | [查看 04:55](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=295) |
| q066 | 黑风魔女常规阶段，被炸弹点名后应怎样处理？ | [查看 05:00](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=300) |
| q067 | 看到魔女投放小虫子的提示后，炸弹候选应先做什么？ | [查看 08:30](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=510) |
| q068 | 黑风魔女的两次飞天蜘蛛阶段大约发生在多少血量？ | [查看 08:50](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=530) |
| q069 | 飞天蜘蛛阶段开始后，分配到各点的玩家首先应做什么？ | [查看 05:08](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=308) |
| q070 | 黑风魔女蜘蛛阶段，小蜘蛛出现后的常见处理顺序是什么？ | [查看 05:17](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=317) |
| q071 | 黑风魔女蜘蛛阶段，大蜘蛛转头面向首领准备回血时，控制位应做什么？ | [查看 05:24](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=324) |
| q072 | 黑风魔女蜘蛛阶段，大蜘蛛准备为首领回血时，小蜘蛛仍在附近，团队应如何配合？ | [查看 05:24](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=324) |
| q073 | 黑风魔女第二次飞天后进入后期，蜘蛛处理与前面相比有什么变化？ | [查看 05:33](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=333) |
| q074 | 黑风魔女后期首领与蜘蛛同场时，如何安排人手兼顾首领和清怪？ | [查看 05:49](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=349) |
| q075 | 黑风魔女第一次蜘蛛处理结束、首领准备落地时，主 T 应特别注意什么？ | [查看 09:45](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=585) |
| q076 | 黑风魔女砸地时，近战队员应注意什么？ | [查看 06:23](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=383) |
| q077 | 黑风魔女后期连续两轮小怪积压、处理速度跟不上时，应优先检查什么？ | [查看 06:36](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=396) |
| q078 | 魔女主 T 处理冲锋与扫描时，需要关注哪些信息？ | [查看 04:13](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=253) |
| q079 | 黑风魔女常规阶段，团队处理炸弹点名时，哪些做法正确？ | [查看 04:55](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=295) |
| q080 | 飞天蜘蛛阶段有哪些正确的团队分工？ | [查看 05:08](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=308) |
| q081 | 魔女进入后期后，哪些情况需要同时关注？ | [查看 05:33](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=333) |
| q082 | 黑风魔女被击倒后，主 T 应结合首领动作、面向和不祥气息的位置判断冲锋落点。 | [查看 04:24](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=264)；客户端 |
| q083 | 黑风魔女常规阶段，安排多人承担炸弹点名意味着被点名者应留在人群中共同承受爆炸。 | [查看 05:00](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=300) |
| q084 | 大蜘蛛转头面向首领准备回血时，可以由控制位按指挥打断。 | [查看 05:24](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=324) |
| q085 | 第二次飞天之后，魔女与蜘蛛不可能同时出现在场上。 | [查看 05:33](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=333) |
| q086 | 选择填空：黑风魔女被击倒后，主 T 应根据首领动作判断冲锋____，并留意不祥气息。 | [查看 04:13](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=253)；客户端 |
| q087 | 选择填空：大蜘蛛面向首领准备回血时，可按指挥使用眩晕或____打断。 | [查看 05:24](https://www.bilibili.com/video/BV1Gh4x6wEAt/?t=324) |
