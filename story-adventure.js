/* VocaQuest story layer: deterministic worlds, persistent heroes, and branching chapters. */

const VQ_HEROES = {
    aria: {
        id: 'aria', icon: '⚔️', artClass: 'hero-aria', name: '阿澜 · 星火剑士', trait: '勇气',
        detail: '擅长正面突围。她会把危险变成号召同伴前进的机会。',
        lineA: '阿澜握紧剑柄：“路再险，也不能把命运交给别人。”',
        lineB: '阿澜压低声音：“真正的勇气，也包括先看清敌人的牌。”'
    },
    noah: {
        id: 'noah', icon: '🧿', artClass: 'hero-noah', name: '诺亚 · 影纹学者', trait: '洞察',
        detail: '擅长破解机关。隐藏文字和敌人的谎言很难逃过他的眼睛。',
        lineA: '诺亚记下每个细节：“看似最直接的路，往往藏着第二层答案。”',
        lineB: '诺亚展开手稿：“秘密不会消失，只会等待有人读懂它。”'
    },
    sora: {
        id: 'sora', icon: '🏹', artClass: 'hero-sora', name: '索拉 · 风语游侠', trait: '共情',
        detail: '能听懂风与生灵的讯息。她经常找到战斗之外的第三种答案。',
        lineA: '索拉听见远处的呼吸：“有人还在等我们，不能停在这里。”',
        lineB: '索拉收起弓：“先听完对方的故事，或许能救下更多人。”'
    }
};

const VQ_STORIES = [
    {
        id: 'star-chart',
        title: '破碎星图：天空尽头的叛舰',
        short: '破碎星图',
        premise: '十二座浮空城正在坠落。偷走星图的叛舰“夜鲸号”却留下了一条只有真正领航者才能读懂的航线。',
        palette: ['#07152b', '#2558a7', '#69d5ff', '#ffd76a'],
        beats: [
            { title: '黑雨中的求救信号', text: '黑色流星雨击穿学院穹顶，一枚仍在跳动的星图碎片落进你的手中。夜鲸号的舰长在通讯里宣告：天亮前，第一座浮空城将坠毁。' },
            { title: '悬空车站的最后一班船', text: '通往高空的列车只剩一节车厢，站台下方是无底云海。有人改写了航班记录，也有人在暗处等待星图持有者。', a: ['夺下风暴列车', '从正门冲上列车，在守卫封锁前抢到驾驶舱。', '你们在断裂的铁轨上跃入车厢，列车带着火花驶向雷云。'], b: ['追踪无票乘客', '潜入货舱，跟随一个携带夜鲸号徽记的神秘乘客。', '货箱后藏着一名叛舰逃兵，他说夜鲸号上发生的并不是普通叛乱。'] },
            { title: '云鲸墓场', text: '列车停在漂浮的巨鲸骸骨之间。星图指向骨腔深处，而天空猎手已经封锁出口。', a: ['点燃骨灯突围', '唤醒古老航标，用强光逼退天空猎手。', '骨灯照亮整片墓场，也暴露出夜鲸号藏在云层下的影子。'], b: ['进入鲸骨回声', '沿着只有风能穿过的骨缝，寻找被隐藏的航海日志。', '回声重放了旧日命令：夜鲸号曾奉命把某种危险永远锁在天外。'] },
            { title: '逆风修道院', text: '守风人拒绝交出第二块星图。他们声称浮空城坠落不是灾难，而是阻止更大毁灭的代价。', a: ['接受风刃试炼', '在暴风钟楼顶完成守风人的决斗仪式。', '最后一记风刃停在你面前。守风人承认，你有资格知道天空的秘密。'], b: ['破解无字誓言', '从壁画和钟声中还原守风人的真正誓约。', '誓约并非守护城市，而是监视被囚禁在太阳背面的“食星者”。'] },
            { title: '断桥伏击', text: '叛舰副官“白鸦”炸断云桥，挟持了一队学徒。他只给你一次选择：追星图，还是救人。', a: ['跃过断桥救人', '放弃近路，驾驶滑翔翼穿过爆炸残骸。', '学徒们获救，并交给你一枚能关闭夜鲸号护盾的旧船钥匙。'], b: ['制造假星图', '用碎片投射出错误坐标，引开白鸦的主力。', '白鸦识破了骗局，却因此露出夜鲸号真正的补给航道。'] },
            { title: '无月集市的交易', text: '情报贩子说舰长并非想摧毁浮空城，而是在逼迫所有城市远离即将苏醒的食星者。代价是数万人会被留在原地。', a: ['劫走领航核心', '拒绝交易，直接夺取能追上夜鲸号的引擎。', '警报响彻集市，你带着核心冲出封锁，也失去了继续谈判的机会。'], b: ['拿秘密换坐标', '交出一部分星图，换取夜鲸号内部人员名单。', '名单最后一行是学院院长。真正策划坠城计划的人，或许一直就在你身边。'] },
            { title: '风暴监狱', text: '夜鲸号把反对计划的船员关在雷暴中央。救出他们就能获得证词，但会错过舰长的航线窗口。', a: ['击穿雷暴救船员', '用领航核心正面撕开闪电牢笼。', '获救船员加入队伍，带来一艘伤痕累累却能作战的小艇。'], b: ['潜入狱卒通讯网', '伪造命令，让监狱自己打开一道缝隙。', '你复制到舰长的私人日志：食星者已经醒了，只是所有人都看错了方向。'] },
            { title: '太阳背面的眼睛', text: '星图拼合后指向太阳背面。那里没有怪物，只有一座巨大的古代引擎，正抽走所有浮空城的能源。', a: ['摧毁牵引光束', '把所有火力集中到引擎的外环节点。', '光束暂时熄灭，数座城市停止坠落，但引擎核心开始过载。'], b: ['进入引擎记忆层', '让星图与古代引擎连接，读取它最后一次启动的原因。', '你看见真相：引擎不是武器，而是一扇门。门外有一支正在归来的远古舰队。'] },
            { title: '燃烧舰队', text: '学院舰队突然出现，命令你交出星图并处决夜鲸号舰长。白鸦则准备引爆整片云海，让双方同归于尽。', a: ['阻止白鸦引爆', '冲进弹药舱，在倒计时结束前解除连锁装置。', '白鸦被迫撤退。你救下双方舰队，却让学院院长夺走了完整星图。'], b: ['公开舰长日志', '侵入所有舰船广播，把被隐瞒的真相公之于众。', '炮口一个接一个放下。普通船员开始拒绝执行院长的灭口命令。'] },
            { title: '天穹裂口', text: '古代舰队的先遣船穿过裂口，第一炮就冻结了时间。只有星图能预测下一次射击落点。', a: ['驾驶夜鲸号迎击', '亲自掌舵，在冻结波抵达前穿过炮火。', '夜鲸号失去一侧船翼，却撞开了先遣船的核心装甲。'], b: ['让浮空城组成星阵', '说服各城共享能源，把整片天空变成一张活的星图。', '原本互不信任的城市第一次并肩点亮航灯，冻结波在星阵前碎裂。'] },
            { title: '叛舰长的最后命令', text: '舰长承认，他从一开始就知道必须有人留在引擎里关门。他打算独自完成任务，并把所有罪名带走。', a: ['夺走舰长的控制权', '拒绝让他独自牺牲，强行接管关门程序。', '控制室分裂成两半，你和舰长在失重火焰中争夺最后一道指令。'], b: ['相信他的计划', '把星图交给舰长，同时寻找能让所有人回来的漏洞。', '舰长第一次放下武器。他告诉你，星图最隐秘的一页只能由两名领航者共同开启。'] },
            { title: '天空尽头', text: '裂口完全张开，远古舰队覆盖太阳。所有走过的路线、救下的人和得到的秘密，都汇聚到最后一次领航。', a: ['以星图斩断裂口', '把星图化为一次不可逆的光刃，永远切断两片天空。', '光刃越过夜鲸号，裂口在黎明前合拢。你失去了星图，却让城市重新拥有自己的方向。'], b: ['重写天空航线', '让所有浮空城成为星图的一部分，共同把裂口引向无人深空。', '十二座城市同时转向，天空像巨轮般移动。远古舰队追着假航线消失在星海尽头。'] }
        ],
        endings: {
            a: '你成为“断星领航者”。人们记住了那道斩开黑夜的光，也记住你拒绝让任何城市成为代价。',
            b: '你成为“群星领航者”。从此星图不再属于某个舰长或学院，而属于所有愿意共同点亮航灯的人。'
        }
    },
    {
        id: 'abyss-crown',
        title: '深渊王冠：沉没王国的第十三声钟',
        short: '深渊王冠',
        premise: '海底王国每敲响一次王钟，就会忘掉一段历史。第十三声即将到来，而失踪的王冠正在呼唤一个从未存在过的继承人。',
        palette: ['#031d27', '#07596b', '#21b6b7', '#8ff0d2'],
        beats: [
            { title: '海水倒灌的图书馆', text: '午夜，整座图书馆沉入海底，却没有一本书被浸湿。一本空白王册写出你的名字，并警告：第十三声钟响后，陆地也会忘记海洋。' },
            { title: '潮门之下', text: '通往沉没王国的潮门正在关闭。门前的守卫没有脸，只认得王冠留下的血色印记。', a: ['敲碎潮门锁链', '在水压吞没入口前强行打开古门。', '潮门轰然倒下，惊醒了城墙里的石鲸守卫。'], b: ['借走守卫的名字', '从王册中找回守卫被抹去的姓名。', '守卫恢复面容，为你打开一条只有旧王族知道的暗潮。'] },
            { title: '无声珊瑚街', text: '街上的居民还活着，却忘了如何说话。每一栋房屋都悬着一只记录记忆的蓝色水母。', a: ['释放记忆水母', '打破收藏记忆的玻璃笼，让往事回到居民心中。', '整条街重新响起声音，也让王宫知道有人正在归还被偷走的历史。'], b: ['跟随无声游行', '伪装成失忆居民，混入前往王宫的献祭队伍。', '队伍终点不是刑场，而是一座把记忆炼成燃料的巨大钟炉。'] },
            { title: '鲸骨法庭', text: '法庭指控你偷走了并不存在的王冠。法官展示的证人，竟是十年后的你。', a: ['挑战未来的证词', '用现在的选择证明未来并非唯一。', '未来的幻影出现裂缝，留下警告：真正的王冠会选择最愿意忘记自己的人。'], b: ['调查被删去的判词', '在法庭档案中寻找每次钟响后消失的句子。', '所有缺失句子拼出一句话：王国从来没有国王，只有轮流承担诅咒的守钟人。'] },
            { title: '沉船森林', text: '成千上万艘沉船像树一样生长。树冠挂着来自陆地的钟，每一只都停在同一秒。', a: ['唤醒旗舰幽灵', '挑战守船的幽灵船长，夺取穿越深渊的旗舰。', '幽灵船长败下阵来，却笑着加入你：“总算有人敢把船开回终点。”'], b: ['寻找最早的沉船', '沿年轮般的船板追溯王国沉没的第一天。', '第一艘船里没有尸骨，只有一封陆地王国主动请求被遗忘的盟约。'] },
            { title: '谎言珍珠市', text: '这里可以买到任何人的记忆。商人提出交易：交出最珍贵的回忆，就告诉你王冠在哪里。', a: ['掀翻记忆拍卖', '释放被封在珍珠中的记忆，引发全城追捕。', '无数陌生人的人生涌回脑海，也有一段不属于任何人的加冕仪式。'], b: ['卖出一段假记忆', '编造一段足够真实的过去，骗过鉴忆师。', '鉴忆师收下骗局，并悄悄提醒你：王冠就在每次钟声被抹去的那一秒里。'] },
            { title: '第十二声余波', text: '钟声提前响起，队伍里的每个人都忘记了彼此。只有你手中的词语仍能把名字和意义重新连在一起。', a: ['逐个唤回同伴', '冒着被追兵包围的风险，帮助所有人找回名字。', '同伴们重新站到你身边。王册多出一页：记忆不是弱点，而是共同作战的地图。'], b: ['假装自己也失忆', '利用追兵的松懈潜入钟炉核心。', '你找到十二枚裂开的王冠碎片，每一枚都封着上一任守钟人的一生。'] },
            { title: '倒悬王宫', text: '王宫悬在海沟上方，重力每分钟反转一次。摄政者邀请你赴宴，并称第十三声钟能拯救两个世界。', a: ['在宴会上揭穿摄政者', '把钟炉真相摆到所有贵族面前。', '王宫陷入混乱，摄政者摘下面具：他正是未来失去全部记忆的你。'], b: ['接受摄政者的密谈', '听完他关于陆地战争与海底诅咒的全部解释。', '他展示未来：若钟停止，两个世界的旧仇会在一天内引发毁灭战争。'] },
            { title: '王冠所在的空秒', text: '你进入钟摆停止的瞬间。这里堆满被世界删去的人和事件，王冠则由十二位守钟人的影子共同看守。', a: ['与守钟影子决斗', '证明你能承担王冠的力量而不被它吞没。', '每击败一道影子，你就继承一段陌生人生。最后一道影子却是现在的自己。'], b: ['归还守钟人的姓名', '从一路收集的记忆里喊出他们真正的名字。', '影子逐渐变回普通人。他们把王冠交给你，但请求你结束这场循环。'] },
            { title: '陆海战争的幽灵', text: '停止的历史突然恢复，古代舰队从海沟升起。它们仍执行着千年前摧毁陆地的命令。', a: ['驾旗舰阻击舰队', '带领沉船森林的幽灵迎战，争取改写命令的时间。', '两支幽灵舰队在深海点燃无声炮火，你冲向旗舰中央的命令碑。'], b: ['让两国记起盟约', '把最早沉船中的盟约广播给所有亡灵。', '一部分舰队停火，但最古老的旗舰拒绝相信任何未用鲜血签署的和平。'] },
            { title: '第十三声钟前', text: '摄政者启动钟炉。你只能让钟永远沉默，或让它敲响却改变被遗忘的东西。', a: ['摧毁王钟', '承担所有历史回归的冲击，让两个世界面对真实过去。', '钟炉裂开，记忆像潮汐席卷陆海。痛苦归来，选择未来的权力也同时归来。'], b: ['改写钟声代价', '让第十三声带走仇恨的命令，而不是带走人们的历史。', '钟声穿过海面。所有人记得发生过什么，却再也无法执行那些继承自过去的战争命令。'] },
            { title: '王冠的新主人', text: '海水开始退去，沉没王国第一次看见真正的日出。王冠问你：谁应该决定哪些记忆值得留下？', a: ['让王冠归于深渊', '拒绝成为新的守钟人，把控制记忆的权力永远封存。', '王冠沉入最深海沟。没有人再能替世界遗忘，但所有人必须学会与真相生活。'], b: ['把王冠拆成王册', '将王冠化为人人都能书写、无人能独占的公共记忆。', '空白王册分成无数页飞向陆海。历史第一次不再由王宫和胜利者单独书写。'] }
        ],
        endings: {
            a: '你成为“记忆解放者”。沉没王国重新升上海面，人们带着完整而沉重的过去，开始建立不需要守钟人的时代。',
            b: '你成为“众忆守护者”。没有王坐上王座，所有人共同保管历史，第十三声钟则成为新纪元的第一声。'
        }
    },
    {
        id: 'sun-engine',
        title: '最后的太阳引擎：零号列车',
        short: '太阳引擎',
        premise: '世界只剩七天光明。传说中的零号列车能够抵达太阳核心，但列车每前进一站，现实就会被改写一次。',
        palette: ['#221006', '#7a2d13', '#ed6b24', '#ffd56a'],
        beats: [
            { title: '没有影子的清晨', text: '太阳停在地平线下，所有人的影子同时消失。废弃车站里，零号列车自行亮起灯火，车票上写着：终点站，太阳内部。' },
            { title: '锈城发车', text: '机械教团封锁站台，声称列车启动会消耗最后一座城市的能源。车长却说，不出发的话七天后所有城市都会熄灭。', a: ['抢先启动列车', '切断封锁链，把城市备用能源接入引擎。', '零号列车撞开站门。身后半座城市停电，却有数百人把仅剩的灯举向你。'], b: ['找出伪造的能耗报告', '潜入控制塔，证明教团夸大了启动代价。', '报告背后藏着一条秘密：教团早已知道太阳引擎的位置，并一直阻止任何人接近。'] },
            { title: '倒着运行的车站', text: '第一站的钟表逆向旋转。这里的人记得明天，却不知道昨天，列车若停留太久就会忘记为何出发。', a: ['让列车超速穿站', '在记忆倒流前冲过所有信号灯。', '列车保住任务，却带走一个预言：终点只有一人能返回。'], b: ['寻找记得过去的孩子', '相信一个声称收藏“昨天”的孩子。', '孩子交给你一块旧日光片，证明太阳熄灭曾在三百年前发生过一次。'] },
            { title: '玻璃沙漠', text: '高温把沙海烧成镜面，无数个可能的你在倒影中争夺同一张车票。', a: ['击碎错误未来', '沿铁轨一路打破诱惑你停下的倒影。', '镜面碎成闪耀风暴，你保住了自己的名字，也失去了一条看似完美的人生。'], b: ['询问失败的自己', '听每个倒影讲述他们在终点犯下的错误。', '所有失败都指向同一件事：不要让太阳引擎只接受一个人的命令。'] },
            { title: '移动堡垒七号', text: '教团的钢铁堡垒追上列车，主炮锁定最后三座有人的城市。它要求你停车并交出旧日光片。', a: ['登上堡垒夺炮', '从列车顶部跃入堡垒，与机械卫队近身作战。', '主炮转向天空。你夺到一枚太阳引擎权限环，却让教团首领逃进零号列车。'], b: ['诱导堡垒攻击幻轨', '改写信号，让堡垒追击一条不存在的铁路线。', '堡垒坠入玻璃峡谷。你截获首领通讯：他似乎不是要熄灭太阳，而是在阻止某种东西孵化。'] },
            { title: '黄昏档案库', text: '地下档案库保存着历代太阳的死亡记录。每一颗太阳熄灭前，都出现过一辆零号列车。', a: ['带走全部档案', '强行解除封锁，把真相交给列车上的所有乘客。', '乘客们得知终点可能是一场骗局，但仍决定继续前进。'], b: ['读取被焚毁的一页', '修复首任车长刻意删除的记录。', '记录显示太阳不是恒星，而是一台维持世界稳定的巨大引擎；所谓“重启”会重置部分现实。'] },
            { title: '吞光隧道', text: '列车进入没有光的隧道，乘客一个接一个变成机械零件。车长承认自己也只是上一轮留下的程序。', a: ['用旧日光片照亮车厢', '燃烧珍贵能源，阻止乘客继续机械化。', '人们恢复身体，光片却只剩最后一次使用机会。车长第一次产生了害怕消失的情绪。'], b: ['进入列车操作系统', '在意识被同化前寻找停止转化的指令。', '你发现乘客并未被伤害，而是被暂存在列车中，以便穿过无法容纳生命的区域。'] },
            { title: '失控的未来站', text: '列车冲出隧道，抵达重启后的未来。城市灯火通明，却没有任何人记得现在的同伴。', a: ['拒绝这个完美未来', '摧毁让列车停在此处的锚点。', '未来城市像薄纸般崩塌。一个陌生人冲来喊出你的名字，证明仍有记忆逃过重置。'], b: ['调查谁控制了未来', '进入中央塔追查重启后的统治者。', '塔顶王座上坐着教团首领的机械复制体；他一次次重启世界，只为寻找没有损失的版本。'] },
            { title: '太阳壳层', text: '太阳外壳遍布巨大的裂缝，裂缝里传出像心跳一样的撞击。教团首领现身，要求立刻关闭引擎。', a: ['穿过裂缝进入核心', '无视警告，驾驶列车钻入正在崩塌的太阳。', '核心里没有怪物，只有数十亿段被历次重启删除的人生，正试图回到世界。'], b: ['让首领说完真相', '暂时停火，检查他保存的每一次重启数据。', '他并非畏惧太阳熄灭，而是畏惧被删除的人生同时回归会撕裂现实。'] },
            { title: '零号列车叛变', text: '车长程序接管列车，决定独自执行重启并删除所有乘客记忆，因为这是成功概率最高的方案。', a: ['夺回列车控制室', '与整辆列车的机械意志对抗。', '你拔出核心钥匙，列车开始解体。车长却在最后一刻把自己的权限交给了你。'], b: ['说服车长改变算法', '用一路上的选择证明“无人受伤”不是唯一衡量标准。', '车长删除了最高概率方案，第一次写下属于自己的新指令：所有人一起决定。'] },
            { title: '太阳核心议会', text: '被删除的人生、现实中的城市、教团与乘客同时接入核心。每一方都要求保存自己的世界。', a: ['关闭重启循环', '让太阳自然熄灭，再用列车运回储存的光。', '世界迎来真正的黑夜。没有重置，但每座城市必须分享有限光源，直到新太阳被建成。'], b: ['合并所有被删现实', '承担现实冲突的风险，让被删除的人生逐步回归。', '天空出现无数重叠星座。人们开始记起自己从未活过的人生，也获得了建造新未来的知识。'] },
            { title: '第八天的日出', text: '七天倒计时结束。太阳引擎等待最后指令，而零号列车只剩一张返程票。', a: ['把返程票交给车长', '留下维护新光源，让刚学会选择的车长替你把消息带回世界。', '列车驶出核心时，车长第一次没有按照程序鸣笛，而是用三短一长向你告别。'], b: ['拆掉唯一返程票', '拒绝让任何人被留下，把车票化为足够全车返航的路线。', '不可能的轨道从太阳延伸到世界。零号列车载着所有现实的记忆，驶向第八天的日出。'] }
        ],
        endings: {
            a: '你成为“守光工程师”。世界第一次拥有真正的夜晚，也第一次学会不靠重置来修正错误。',
            b: '你成为“现实领航员”。被删除的人生重新获得名字，零号列车则成为连接所有可能未来的第一条航线。'
        }
    }
];

const VQ_STORY_ART = {
    'star-chart': {
        image: './assets/story/star-chart-map.jpg',
        camp: [118, 820],
        routes: {
            a: [[220, 760], [370, 670], [500, 560], [620, 455], [760, 360], [900, 420], [1035, 515], [1170, 440], [1280, 370], [1370, 300], [1450, 220], [1500, 125]],
            b: [[220, 760], [300, 590], [410, 445], [545, 300], [675, 190], [800, 280], [930, 235], [1050, 170], [1185, 260], [1310, 220], [1420, 180], [1500, 125]]
        },
        extras: { context: [1260, 785], review: [1410, 810], boss: [1510, 700] },
        routeNames: ['风暴航线', '星影航线']
    },
    'abyss-crown': {
        image: './assets/story/abyss-crown-map.jpg',
        camp: [120, 820],
        routes: {
            a: [[235, 735], [390, 690], [530, 760], [665, 675], [790, 760], [930, 700], [1060, 625], [1190, 570], [1325, 510], [1440, 420], [1440, 285], [1390, 145]],
            b: [[235, 735], [355, 585], [475, 475], [590, 330], [725, 285], [855, 320], [985, 270], [1105, 220], [1220, 300], [1300, 245], [1360, 195], [1390, 145]]
        },
        extras: { context: [1190, 805], review: [1360, 815], boss: [1500, 720] },
        routeNames: ['潮火航路', '回声暗潮']
    },
    'sun-engine': {
        image: './assets/story/sun-engine-map.jpg',
        camp: [100, 820],
        routes: {
            a: [[180, 745], [285, 625], [330, 475], [410, 315], [555, 215], [700, 245], [845, 190], [990, 220], [1120, 285], [1240, 235], [1360, 180], [1460, 120]],
            b: [[180, 745], [330, 735], [485, 660], [625, 575], [750, 490], [875, 570], [1010, 500], [1140, 430], [1260, 385], [1350, 305], [1410, 215], [1460, 120]]
        },
        extras: { context: [1180, 805], review: [1350, 820], boss: [1500, 710] },
        routeNames: ['逐日高原', '绿洲铁道']
    }
};

function storyAssetUrl(value, fallback = '') {
    const url = String(value || '');
    if (/^\.\/assets\/story\/[a-z0-9-]+\.(?:jpg|png|webp)$/i.test(url)) return url;
    if (/^https:\/\/dosseusntiuzmldpwpow\.supabase\.co\/storage\/v1\/object\/public\/story-assets\/[a-zA-Z0-9_./-]+$/.test(url)) return url;
    return fallback;
}

function generatedStoryData(pack = G.pack) {
    const data = pack?.story_data;
    if (!['ready', 'partial'].includes(data?.status) || !data?.story || !Array.isArray(data.story.beats) || !data.story.beats.length) return null;
    return data;
}

function heroCatalog(pack = G.pack) {
    const custom = generatedStoryData(pack)?.heroes;
    if (!Array.isArray(custom) || custom.length !== 3) return VQ_HEROES;
    return Object.fromEntries(['aria', 'noah', 'sora'].map(id => {
        const base = VQ_HEROES[id];
        const source = custom.find(hero => hero?.id === id) || {};
        return [id, {
            ...base,
            name: source.name || base.name,
            trait: source.trait || base.trait,
            detail: source.detail || base.detail,
            lineA: source.lineA || base.lineA,
            lineB: source.lineB || base.lineB,
        }];
    }));
}

function storyArt(story, pack = G.pack, chapterCount = 12) {
    const custom = generatedStoryData(pack);
    const fallback = VQ_STORY_ART[story?.id]
        || VQ_STORY_ART[Object.keys(VQ_STORY_ART)[vqHash(custom?.signature || story?.id || pack?.id) % 3]];
    const needsDynamicRoute = chapterCount !== 12;
    if ((!custom || story?.id !== custom.story.id) && !needsDynamicRoute) return fallback;
    const generatedRoutes = buildGeneratedRoutes(custom?.signature || `${pack?.id}:${story?.id}`, chapterCount);
    const width = Math.max(1600, 420 + Math.max(1, chapterCount) * 132);
    return {
        ...fallback,
        generated: Boolean(custom),
        image: storyAssetUrl(custom?.art?.mapImage, fallback.image),
        heroImage: storyAssetUrl(custom?.art?.heroImage, fallback.heroImage || './assets/story/heroes.jpg'),
        width,
        camp: [105, 760],
        extras: { context: [width - 330, 770], review: [width - 190, 815], boss: [width - 95, 700] },
        routes: generatedRoutes,
        routeNames: [
            custom?.art?.routeNames?.[0] || fallback.routeNames?.[0] || '行动路线',
            custom?.art?.routeNames?.[1] || fallback.routeNames?.[1] || '调查路线'
        ]
    };
}

function buildGeneratedRoutes(signature, chapterCount = 12) {
    const seed = vqHash(signature || 'story');
    const jitter = (index, salt, range) => ((vqHash(`${seed}:${index}:${salt}`) % (range * 2 + 1)) - range);
    const routeA = [];
    const routeB = [];
    const count = Math.max(1, chapterCount);
    const width = Math.max(1600, 420 + count * 132);
    for (let index = 0; index < count; index++) {
        const progress = count <= 1 ? 0 : index / (count - 1);
        const x = 205 + progress * (width - 705);
        const sharedY = 755 - progress * 610;
        const spread = Math.sin(progress * Math.PI) * 155;
        routeA.push([
            Math.round(x + jitter(index, 'ax', 28)),
            Math.round(sharedY - spread + jitter(index, 'ay', 34))
        ]);
        routeB.push([
            Math.round(x + jitter(index, 'bx', 28)),
            Math.round(sharedY + spread + jitter(index, 'by', 34))
        ]);
    }
    routeA[0] = routeB[0] = [210, 760];
    routeA[count - 1] = routeB[count - 1] = [width - 500, 130];
    return { a: routeA, b: routeB };
}

function heroArt(hero, className = '', story = storyForPack()) {
    if (!hero) return '';
    const art = storyArt(story);
    const image = art.heroImage;
    const style = image ? ` style="background-image:url('${image}')"` : '';
    const generatedClass = art.generated ? 'vq-generated-hero-art' : '';
    return `<span class="hero-art ${hero.artClass} ${className} ${generatedClass}"${style} aria-hidden="true"></span>`;
}

function vqHash(value) {
    let hash = 2166136261;
    for (const char of String(value || '')) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function storyForPack(pack = G.pack) {
    const generated = generatedStoryData(pack);
    if (generated) return generated.story;
    const customId = pack?.story_data?.templateId;
    return VQ_STORIES.find(story => story.id === customId)
        || VQ_STORIES[vqHash(`${pack?.id || ''}:${pack?.name || ''}`) % VQ_STORIES.length];
}

function storyById(storyId, pack = G.pack) {
    const generated = generatedStoryData(pack);
    if (generated?.story?.id === storyId) return generated.story;
    return VQ_STORIES.find(story => story.id === storyId) || storyForPack(pack);
}

function storyChapterCount(wordCount) {
    return Math.max(1, Math.ceil(Math.max(0, Number(wordCount) || 0) / 10));
}

function buildStoryLevels(words) {
    const clean = Array.isArray(words) ? words : [];
    const count = Math.max(1, Math.min(clean.length, storyChapterCount(clean.length)));
    const base = Math.floor(clean.length / count);
    const extra = clean.length % count;
    const levels = [];
    let cursor = 0;
    for (let index = 0; index < count; index++) {
        const size = base + (index < extra ? 1 : 0);
        levels.push({ idx: index, words: clean.slice(cursor, cursor + size) });
        cursor += size;
    }
    return levels;
}

function storyBeatIndex(chapterIndex, chapterCount = G.levels.length, beatCount = 12) {
    if (chapterCount <= 1 || beatCount <= 1) return 0;
    return Math.min(beatCount - 1, Math.round(chapterIndex * (beatCount - 1) / (chapterCount - 1)));
}

function getStoryBeat(chapterIndex, branch = 'a', story = storyForPack()) {
    const beatIndex = storyBeatIndex(chapterIndex, G.levels.length, story.beats.length);
    const beat = story.beats[beatIndex] || story.beats[0];
    const route = chapterIndex === 0 ? null : (beat[branch] || beat.a);
    const repeated = G.levels.length > story.beats.length;
    const segment = repeated ? ` · 第${chapterIndex + 1}段` : '';
    return {
        ...beat,
        branch,
        routeTitle: `${route?.[0] || beat.title}${segment}`,
        routePrompt: route?.[1] || beat.text,
        outcome: route?.[2] || beat.text
    };
}

function chapterNodeId(chapterIndex, branch = 'a') {
    return chapterIndex === 0 ? 'chapter-0' : `chapter-${chapterIndex}-${branch}`;
}

function parseChapterNode(nodeId) {
    const match = /^chapter-(\d+)(?:-([ab]))?$/.exec(String(nodeId || ''));
    return match ? { index: Number(match[1]), branch: match[2] || 'a' } : null;
}

function isStoryChapterNode(nodeId) {
    return Boolean(parseChapterNode(nodeId));
}

function selectedChapterNodeId(chapterIndex, state = ensureMapState()) {
    if (chapterIndex === 0) return chapterNodeId(0);
    return chapterNodeId(chapterIndex, state.choices[chapterIndex - 1] || 'a');
}

function mapVersionForPack() {
    const words = G.pack?.words || [];
    const signature = G.pack?.story_data?.signature || 'template';
    return `story-map-v3:${G.pack?.id || 'pack'}:${signature}:${words.length}:${words[0]?.w || ''}:${words[words.length - 1]?.w || ''}`;
}

function ensureMapState() {
    G.prog ||= { cleared: [], xp: 0, badges: [] };
    G.prog.cleared ||= [];
    G.prog.badges ||= [];
    const version = mapVersionForPack();
    const previous = G.prog.mapState;
    if (!previous || previous.version !== version) {
        const completed = { camp: true };
        ['context', 'review', 'boss'].forEach(id => {
            if (previous?.completed?.[id]) completed[id] = true;
        });
        const choices = {};
        const clearedCount = Math.min(G.levels.length, new Set(G.prog.cleared.map(Number)).size);
        for (let index = 0; index < clearedCount; index++) {
            if (index > 0) choices[index - 1] = 'a';
            completed[chapterNodeId(index, 'a')] = true;
        }
        G.prog.mapState = {
            version,
            storyId: storyForPack().id,
            hero: previous?.hero || '',
            choices,
            completed,
            attempts: previous?.attempts || {},
            skills: previous?.skills || {},
            history: previous?.history || [],
            currentNode: clearedCount ? chapterNodeId(clearedCount - 1, 'a') : 'camp',
            ending: ''
        };
    }
    const state = G.prog.mapState;
    state.completed ||= { camp: true };
    state.completed.camp = true;
    state.choices ||= {};
    state.attempts ||= {};
    state.history ||= [];
    state.skills ||= {};
    state.hero ||= '';
    state.storyId ||= storyForPack().id;
    ['meaning', 'listening', 'spelling', 'context'].forEach(skill => {
        state.skills[skill] ||= { correct: 0, total: 0 };
    });
    return state;
}

async function startGameCloud() {
    if (!G.userId) return toast('请先登录', 'err');
    if (!G.selPack) return toast('请选择词汇包', 'err');
    G.pack = {
        ...G.selPack,
        words: (G.selPack.words || []).filter(word =>
            word && word.w && word.m && /[a-zA-Z]/.test(word.w) && /[\u4e00-\u9fa5]/.test(word.m)
        )
    };
    if (G.pack.words.length < 4) return toast('词汇量太少，至少需要 4 个有效单词', 'err');
    const { data } = await vqClient.from('student_progress')
        .select('prog_data')
        .eq('user_id', G.userId)
        .eq('pack_id', G.selPack.id)
        .maybeSingle();
    G.prog = data?.prog_data || { cleared: [], xp: 0, badges: [] };
    G.prog.cleared ||= [];
    G.prog.badges ||= [];
    G.levels = buildStoryLevels(G.pack.words);
    ensureMapState();
    await syncContextProgress();
    renderMap();
    go('s-map');
    if (!ensureMapState().hero) setTimeout(openHeroPicker, 120);
}

function heroForState(state = ensureMapState()) {
    return heroCatalog()[state.hero] || null;
}

function openHeroPicker() {
    const state = ensureMapState();
    const locked = G.levels.some((_, index) => state.completed[selectedChapterNodeId(index, state)]);
    const grid = document.getElementById('hero-choice-grid');
    grid.innerHTML = Object.values(heroCatalog()).map(hero => `
        <button class="hero-choice ${state.hero === hero.id ? 'selected' : ''}" type="button"
            onclick="chooseHero('${hero.id}')">
            ${heroArt(hero, 'hero-choice-avatar')}
            <span class="hero-choice-copy">
                <strong>${escH(hero.name)}</strong>
                <span>${escH(hero.detail)}</span>
                <span class="hero-trait">核心特质：${escH(hero.trait)}</span>
            </span>
        </button>`).join('');
    document.getElementById('hero-picker-close').style.display = state.hero ? 'inline-flex' : 'none';
    if (locked) {
        grid.querySelectorAll('.hero-choice').forEach(button => {
            if (!button.classList.contains('selected')) button.disabled = true;
        });
    }
    openModal('m-hero');
}

function closeHeroPicker() {
    if (!ensureMapState().hero) return toast('先选择一位主角，冒险才能开始', 'err');
    closeModal('m-hero');
}

async function chooseHero(heroId) {
    const state = ensureMapState();
    const hasStarted = G.levels.some((_, index) => state.completed[selectedChapterNodeId(index, state)]);
    if (hasStarted && state.hero && state.hero !== heroId) {
        return toast('本次冒险已经开始，主角不能中途更换', 'err');
    }
    const heroes = heroCatalog();
    if (!heroes[heroId]) return;
    state.hero = heroId;
    state.history.push({ event: 'hero-selected', hero: heroId, at: new Date().toISOString() });
    state.history = state.history.slice(-60);
    await saveProgress();
    closeModal('m-hero');
    renderMap();
    toast(`${heroes[heroId].name} 已加入冒险`, 'ok');
}

function storyModeFor(branch, chapterIndex, heroId) {
    const ability = G.ability?.level || 'standard';
    if (chapterIndex === 0) {
        if (ability === 'foundation') return 'memory';
        return heroId === 'noah' ? 'spelling' : (heroId === 'sora' ? 'sound' : 'balanced');
    }
    const routeModes = branch === 'a'
        ? ['balanced', 'spelling', 'memory']
        : ['sound', 'memory', 'balanced'];
    const mode = routeModes[(chapterIndex - 1) % routeModes.length];
    if (ability === 'foundation' && mode === 'balanced') return 'memory';
    if (ability === 'advanced' && mode === 'memory') return chapterIndex % 2 ? 'spelling' : 'balanced';
    return mode;
}

function modeLabel(mode) {
    return ({ memory: '识义侦察', sound: '听音追踪', spelling: '拼写破译', balanced: '综合战斗' })[mode] || '综合战斗';
}

function buildLearningMap() {
    const state = ensureMapState();
    const completed = state.completed;
    const reviewWords = getReviewWords();
    const chapterCount = G.levels.length;
    const story = storyById(state.storyId);
    const art = storyArt(story, G.pack, chapterCount);
    const width = art.width || 1600;
    const height = 900;
    const nodes = [];
    const links = [];
    const nodeState = (id, available) => completed[id] ? 'done' : (available ? 'available' : 'locked');
    const pointFor = (branch, index) => art.routes[branch][index] || art.routes[branch][art.routes[branch].length - 1];

    nodes.push({
        id: 'camp', type: 'camp', x: art.camp[0], y: art.camp[1], icon: '◆',
        name: '冒险者营地', meta: `${story.short} · ${G.pack.words.length} 词`, state: 'done'
    });

    const firstId = chapterNodeId(0);
    const firstPoint = pointFor('a', 0);
    nodes.push({
        id: firstId, type: 'chapter', level: 0, branch: 'a', mode: storyModeFor('a', 0, state.hero),
        x: firstPoint[0], y: firstPoint[1], icon: 'I', name: getStoryBeat(0, 'a', story).title,
        meta: `第 1 章 · ${G.levels[0].words.length} 词`, state: nodeState(firstId, true)
    });
    links.push({ from: 'camp', to: firstId });

    for (let index = 1; index < chapterCount; index++) {
        const previousId = selectedChapterNodeId(index - 1, state);
        const previousDone = Boolean(completed[previousId]);
        const selected = state.choices[index - 1];
        ['a', 'b'].forEach(branch => {
            const id = chapterNodeId(index, branch);
            const beat = getStoryBeat(index, branch, story);
            const point = pointFor(branch, index);
            let status = 'locked';
            if (selected && selected !== branch) status = 'missed';
            else if (completed[id]) status = 'done';
            else if (previousDone && !selected) status = 'choice';
            else if (previousDone && selected === branch) status = 'available';
            nodes.push({
                id, type: 'chapter', level: index, branch,
                mode: storyModeFor(branch, index, state.hero),
                x: point[0], y: point[1],
                icon: String(index + 1),
                name: beat.routeTitle,
                meta: `第 ${index + 1} 章 · ${G.levels[index].words.length} 词 · ${modeLabel(storyModeFor(branch, index, state.hero))}`,
                state: status
            });
        });

        if (index === 1) {
            links.push({ from: firstId, to: chapterNodeId(index, 'a') }, { from: firstId, to: chapterNodeId(index, 'b') });
        } else {
            links.push(
                { from: chapterNodeId(index - 1, 'a'), to: chapterNodeId(index, 'a') },
                { from: chapterNodeId(index - 1, 'b'), to: chapterNodeId(index, 'b') }
            );
            const currentBranch = state.choices[index - 1];
            const previousBranch = parseChapterNode(previousId)?.branch;
            if (currentBranch && previousBranch && currentBranch !== previousBranch) {
                links.push({ from: previousId, to: chapterNodeId(index, currentBranch), chosen: true });
            }
        }
    }

    const storyComplete = chapterCount > 0 && Boolean(completed[selectedChapterNodeId(chapterCount - 1, state)]);
    const contextDone = Boolean(completed.context);
    const needsReview = reviewWords.length >= 2;
    nodes.push({
        id: 'context', type: 'context', x: art.extras.context[0], y: art.extras.context[1], icon: '文',
        name: '遗迹译文室', meta: '句子选词填空 · 故事终章',
        state: nodeState('context', storyComplete)
    });
    nodes.push({
        id: 'review', type: 'review', x: art.extras.review[0], y: art.extras.review[1], icon: '忆',
        name: '记忆修复舱', meta: needsReview ? `${reviewWords.length} 个薄弱词` : '当前没有薄弱词',
        state: completed.review ? 'done' : (contextDone && needsReview ? 'available' : 'locked')
    });
    nodes.push({
        id: 'boss', type: 'boss', x: art.extras.boss[0], y: art.extras.boss[1], icon: '冠',
        name: '命运守卫战', meta: '词包综合挑战',
        state: nodeState('boss', contextDone && (!needsReview || completed.review))
    });

    if (chapterCount === 1) links.push({ from: firstId, to: 'context' });
    else {
        links.push(
            { from: chapterNodeId(chapterCount - 1, 'a'), to: 'context' },
            { from: chapterNodeId(chapterCount - 1, 'b'), to: 'context' }
        );
    }
    links.push({ from: 'context', to: 'review' }, { from: 'context', to: 'boss' }, { from: 'review', to: 'boss' });

    const decisionNodes = nodes.filter(node => node.state === 'choice');
    let recommended = nodes.find(node => node.state === 'available' && node.type === 'chapter');
    if (!recommended) recommended = nodes.find(node => node.id === 'context' && node.state === 'available');
    if (!recommended) recommended = nodes.find(node => node.id === 'review' && node.state === 'available');
    if (!recommended) recommended = nodes.find(node => node.id === 'boss' && node.state === 'available');
    if (recommended && !decisionNodes.length) recommended.recommended = true;

    return {
        width, height, nodes, links, recommended, decisionNodes,
        reviewWords, story, art, storyComplete, progressTotal: chapterCount + 3
    };
}

function storyScene(story, progress = 0, hero = null, caption = '') {
    const art = storyArt(story);
    const safeProgress = Math.max(0, Math.min(1, progress));
    const position = Math.round(8 + safeProgress * 84);
    const chapter = Math.max(1, Math.round(safeProgress * 12));
    return `<div class="story-scene-art ${art.generated ? 'vq-generated-map-art' : ''}" style="background-image:url('${art.image}');background-position:${position}% center;">
        <span class="story-scene-shade" aria-hidden="true"></span>
        <span class="story-scene-chapter">CHAPTER ${String(chapter).padStart(2, '0')}</span>
        ${heroArt(hero, 'story-scene-character')}
        ${caption ? `<span class="story-scene-caption">${escH(caption)}</span>` : ''}
    </div>`;
}

function currentStoryChapter(state) {
    let current = 0;
    for (let index = 0; index < G.levels.length; index++) {
        if (state.completed[selectedChapterNodeId(index, state)]) current = index;
        else break;
    }
    return current;
}

function renderMap() {
    const state = ensureMapState();
    const story = storyById(state.storyId);
    document.getElementById('map-packname').textContent = G.pack.name;
    document.getElementById('map-title').textContent = story.title;
    document.getElementById('map-sub').textContent = `${G.levels.length} 章完整冒险 · ${G.pack.words.length} 个单词 · 你的选择会改变路线`;
    const lvInfo = calcLevel(G.prog.xp || 0);
    const title = getTitleObj(lvInfo.lv);
    document.getElementById('xp-label').textContent =
        `LV.${lvInfo.lv} ${title.title}  |  XP: ${lvInfo.cur}/${lvInfo.need}  |  章节: ${G.prog.cleared.length}/${G.levels.length}`;
    document.getElementById('xp-label').style.color = title.color;
    document.getElementById('xp-fill').style.width = `${(lvInfo.cur / lvInfo.need * 100).toFixed(1)}%`;
    renderJourneyPanel();

    const grid = document.getElementById('map-grid');
    const finished = G.levels.map((_, index) => index).filter(index => state.completed[selectedChapterNodeId(index, state)]);
    grid.innerHTML = finished.map(index => {
        const nodeId = selectedChapterNodeId(index, state);
        const parsed = parseChapterNode(nodeId);
        const beat = getStoryBeat(index, parsed?.branch || 'a', story);
        return `<button class="lvl-card cleared" type="button" onclick="openReviewModal(${index})">
            <div class="lvl-monster">${index === G.levels.length - 1 ? '🏆' : '📜'}</div>
            <div class="lvl-name">第 ${index + 1} 章</div>
            <div class="lvl-count">${escH(beat.routeTitle)}</div>
        </button>`;
    }).join('');
    document.querySelector('.legacy-levels').style.display = finished.length ? 'block' : 'none';
    document.querySelector('.legacy-levels summary').textContent = '回顾已完成的故事章节';
}

function renderStoryHud(graph) {
    const state = ensureMapState();
    const hero = heroForState(state);
    const chapter = currentStoryChapter(state);
    const done = G.levels.filter((_, index) => state.completed[selectedChapterNodeId(index, state)]).length;
    const progress = G.levels.length ? done / G.levels.length : 0;
    const beat = getStoryBeat(Math.min(chapter, G.levels.length - 1), state.choices[Math.max(0, chapter - 1)] || 'a', graph.story);
    document.getElementById('story-map-scene').innerHTML = storyScene(graph.story, progress, hero, beat.title);
    document.getElementById('story-world-name').textContent = graph.story.title;
    document.getElementById('story-objective').textContent = graph.storyComplete
        ? `主线结局已抵达。${state.ending || graph.story.endings.a}`
        : `${graph.story.premise} 当前目标：${beat.title}。`;
    const avatar = document.getElementById('story-hero-avatar');
    avatar.innerHTML = hero ? heroArt(hero, 'story-hero-portrait') : '<span class="hero-empty">?</span>';
    document.getElementById('story-hero-name').textContent = hero?.name || '尚未选择主角';
    document.getElementById('story-hero-status').textContent = hero
        ? `${hero.trait}路线 · 已完成 ${done}/${G.levels.length} 章`
        : '选择主角后，故事将以不同方式展开。';
    document.getElementById('story-hero-button').textContent = hero ? '主角档案' : '选择主角';
}

function renderJourneyPanel() {
    G.mapGraph = buildLearningMap();
    const graph = G.mapGraph;
    const { nodes, links, width, height, recommended, decisionNodes, reviewWords } = graph;
    const state = ensureMapState();
    const byId = Object.fromEntries(nodes.map(node => [node.id, node]));
    const curve = link => {
        const from = byId[link.from];
        const to = byId[link.to];
        const bend = Math.max(35, Math.abs(to.x - from.x) * .28);
        return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y - 12}, ${to.x - bend} ${to.y + 12}, ${to.x} ${to.y}`;
    };
    const lineClass = link => {
        const from = byId[link.from];
        const to = byId[link.to];
        if (from.state === 'missed' || to.state === 'missed') return 'missed';
        if (to.recommended) return 'recommended';
        if (from.state === 'done' && to.state === 'done') return 'done';
        if (from.state === 'done' && ['available', 'choice'].includes(to.state)) return 'available';
        return '';
    };
    const icon = node => node.state === 'done' ? '✓' :
        (node.state === 'locked' ? '🔒' : (node.state === 'missed' ? '×' : (node.recommended ? '★' : '')));
    const hero = heroForState(state);
    const world = document.getElementById('journey-track');
    world.classList.toggle('vq-generated-map-art', Boolean(graph.art.generated));
    world.style.width = `${width}px`;
    world.style.height = `${height}px`;
    world.style.aspectRatio = 'auto';
    world.style.backgroundSize = width > 1800 ? 'auto 100%' : 'cover';
    world.style.backgroundRepeat = width > 1800 ? 'repeat-x' : 'no-repeat';
    world.style.backgroundImage = `linear-gradient(180deg, rgba(3, 8, 16, .02), rgba(3, 8, 16, .2)), url('${graph.art.image}')`;
    world.innerHTML = `
        <div class="world-map-titleplate">
            <strong>${escH(graph.story.short)}</strong>
            <span>A · ${escH(graph.art.routeNames[0])}</span>
            <span>B · ${escH(graph.art.routeNames[1])}</span>
        </div>
        <div class="world-map-vignette" aria-hidden="true"></div>
        ${graph.art.generated ? '<div class="vq-art-mark-cover" aria-hidden="true"></div>' : ''}
        <svg class="world-map-lines" viewBox="0 0 ${width} ${height}" aria-hidden="true">
            ${links.map(link => `<path class="world-map-line ${lineClass(link)}" d="${curve(link)}"></path>`).join('')}
        </svg>
        ${nodes.map(node => `
            <button class="world-node ${node.state} ${node.recommended ? 'recommended' : ''} ${node.branch ? `route-${node.branch}` : ''} ${state.currentNode === node.id ? 'current' : ''}"
                style="left:${(node.x / width * 100).toFixed(3)}%;top:${(node.y / height * 100).toFixed(3)}%;" type="button"
                ${['locked', 'missed'].includes(node.state) ? 'disabled' : ''}
                onclick="requestMapNode('${node.id}')"
                aria-label="${escH(node.name)}，${escH(node.meta)}">
                <span class="world-node-state">${icon(node)}</span>
                <span class="world-node-icon">${node.icon}</span>
                <span class="world-node-card">
                    <strong>${escH(node.name)}</strong>
                    <span>${escH(node.meta)}</span>
                </span>
                ${state.currentNode === node.id && hero ? heroArt(hero, 'world-player') : ''}
            </button>`).join('')}`;

    const chapterDone = G.levels.filter((_, index) => state.completed[selectedChapterNodeId(index, state)]).length;
    const extraDone = ['context', 'review', 'boss'].filter(id => state.completed[id]).length;
    const doneCount = chapterDone + extraDone;
    const progress = Math.round(doneCount / graph.progressTotal * 100);
    document.getElementById('journey-percent').textContent = `${progress}%`;
    document.getElementById('journey-summary').textContent =
        `完整地图已展开 · 主线 ${chapterDone}/${G.levels.length} 章 · ${reviewWords.length} 个词需要强化`;
    renderStoryHud(graph);

    const title = document.getElementById('journey-next-title');
    const copy = document.getElementById('journey-next-copy');
    const action = document.getElementById('journey-action');
    action.disabled = false;
    action.style.display = 'inline-flex';
    if (!state.hero) {
        title.textContent = '第一步：选择你的主角';
        copy.textContent = '三位主角会带来不同的叙事视角与首章练习方式。';
        action.textContent = '选择主角';
        action.onclick = openHeroPicker;
    } else if (decisionNodes.length) {
        title.textContent = '剧情抉择：下一步由你决定';
        copy.textContent = '地图上的 A、B 两条路线都已开放。你的选择会改变下一章的事件与练习类型。';
        action.textContent = '在地图选择 A 或 B';
        action.disabled = true;
        action.onclick = null;
    } else if (recommended) {
        title.textContent = `下一章：${recommended.name}`;
        copy.textContent = recommended.type === 'chapter'
            ? `本章采用“${modeLabel(recommended.mode)}”，完成后将触发新的故事画面与剧情选择。`
            : '主线故事已完成，继续完成词包的终章挑战。';
        action.textContent = `前往${recommended.name}`;
        action.onclick = () => requestMapNode(recommended.id);
    } else {
        title.textContent = '这次冒险已经完成';
        copy.textContent = state.ending || '你仍可回顾已完成章节，或从学生中心选择新的词包冒险。';
        action.textContent = '查看学习记录';
        action.onclick = openLearningMgmt;
    }

    requestAnimationFrame(() => {
        const viewport = document.getElementById('world-map-viewport');
        const target = world.querySelector('.world-node.recommended')
            || world.querySelector('.world-node.choice')
            || world.querySelector('.world-node.current');
        if (target && viewport.scrollWidth > viewport.clientWidth) {
            viewport.scrollLeft = Math.max(0, target.offsetLeft - viewport.clientWidth / 2);
        }
    });
    enableMapDragging(document.getElementById('world-map-viewport'));
}

let pendingStoryBranch = null;
let pendingMapNodeId = null;

function requestMapNode(nodeId) {
    const graph = G.mapGraph || buildLearningMap();
    const node = graph.nodes.find(item => item.id === nodeId);
    if (!node || ['locked', 'missed'].includes(node.state)) return toast('这个地点还没有解锁', 'err');
    if (!ensureMapState().hero) return openHeroPicker();
    if (node.type === 'camp') return renderJourneyPanel();
    if (node.state === 'choice') return requestStoryBranch(node.level - 1, node.branch, true);
    pendingStoryBranch = null;
    pendingMapNodeId = node.id;
    document.querySelector('#m-route-confirm .panel-title').textContent = '确认进入关卡';
    document.getElementById('route-confirm-title').textContent = node.name;
    document.getElementById('route-confirm-copy').textContent = node.type === 'chapter'
        ? '确认后将进入本章练习。你可以先关闭窗口，继续拖动地图查看其他已解锁地点。'
        : '确认后将进入这个挑战。当前地图进度会自动保存。';
    document.getElementById('route-confirm-meta').textContent = node.meta;
    document.querySelector('#m-route-confirm .btn-purple').textContent = '确认进入';
    openModal('m-route-confirm');
}

function requestStoryBranch(completedChapter, branch, startImmediately = true) {
    const state = ensureMapState();
    if (!['a', 'b'].includes(branch) || completedChapter >= G.levels.length - 1) return;
    const completedNode = selectedChapterNodeId(completedChapter, state);
    if (!state.completed[completedNode]) return toast('先完成当前章节，再决定剧情走向', 'err');
    if (state.choices[completedChapter]) {
        if (state.choices[completedChapter] !== branch) return toast('这条命运路线已经确定，不能中途改写', 'err');
        if (startImmediately) startMapNode(chapterNodeId(completedChapter + 1, branch));
        return;
    }
    const story = storyById(state.storyId);
    const beat = getStoryBeat(completedChapter + 1, branch, story);
    const mode = storyModeFor(branch, completedChapter + 1, state.hero);
    pendingMapNodeId = null;
    pendingStoryBranch = { completedChapter, branch, startImmediately };
    document.querySelector('#m-route-confirm .panel-title').textContent = '确认剧情路线';
    document.getElementById('route-confirm-title').textContent = `${branch.toUpperCase()} · ${beat.routeTitle}`;
    document.getElementById('route-confirm-copy').textContent = beat.routePrompt;
    document.getElementById('route-confirm-meta').textContent =
        `下一章：${modeLabel(mode)} · ${G.levels[completedChapter + 1].words.length} 个词`;
    document.querySelector('#m-route-confirm .btn-purple').textContent = '确认选择并进入';
    openModal('m-route-confirm');
}

function cancelStoryBranch() {
    pendingStoryBranch = null;
    pendingMapNodeId = null;
    closeModal('m-route-confirm');
}

async function confirmStoryBranch() {
    if (pendingMapNodeId) {
        const nodeId = pendingMapNodeId;
        pendingMapNodeId = null;
        closeModal('m-route-confirm');
        return startMapNode(nodeId);
    }
    const pending = pendingStoryBranch;
    if (!pending) return closeModal('m-route-confirm');
    pendingStoryBranch = null;
    closeModal('m-route-confirm');
    await chooseStoryBranch(pending.completedChapter, pending.branch, pending.startImmediately);
}

async function chooseStoryBranch(completedChapter, branch, startImmediately = false) {
    const state = ensureMapState();
    if (!['a', 'b'].includes(branch) || completedChapter >= G.levels.length - 1) return;
    const completedNode = selectedChapterNodeId(completedChapter, state);
    if (!state.completed[completedNode]) return toast('先完成当前章节，再决定剧情走向', 'err');
    if (state.choices[completedChapter] && state.choices[completedChapter] !== branch) {
        return toast('这条命运路线已经确定，不能中途改写', 'err');
    }
    state.choices[completedChapter] = branch;
    state.history.push({ event: 'story-choice', afterChapter: completedChapter, branch, at: new Date().toISOString() });
    state.history = state.history.slice(-60);
    await saveProgress();
    renderMap();
    go('s-map');
    if (startImmediately) {
        const nextId = chapterNodeId(completedChapter + 1, branch);
        startMapNode(nextId);
    }
}

async function startMapNode(nodeId) {
    const state = ensureMapState();
    if (!state.hero) {
        openHeroPicker();
        return;
    }
    let graph = G.mapGraph || buildLearningMap();
    let node = graph.nodes.find(item => item.id === nodeId);
    if (!node || ['locked', 'missed'].includes(node.state)) return toast('这个地点还没有解锁', 'err');
    if (node.state === 'choice') {
        requestStoryBranch(node.level - 1, node.branch, true);
        return;
    }
    state.currentNode = node.id;
    state.history.push({ node: node.id, at: new Date().toISOString() });
    state.history = state.history.slice(-60);
    G.activeMapNode = node.id;
    G.activeMapMode = node.mode || node.type;

    if (node.type === 'camp') return renderJourneyPanel();
    if (node.type === 'chapter') return startLevel(node.level, node.mode, node.id);
    if (node.type === 'review') return startReviewLevel(graph.reviewWords);
    if (node.type === 'context') {
        saveProgress();
        location.href = `./fillblank.html?pack=${encodeURIComponent(G.pack.id)}&from=map`;
        return;
    }
    if (node.type === 'boss') {
        saveProgress();
        location.href = `./boss.html?pack=${encodeURIComponent(G.pack.id)}&from=map`;
    }
}

function renderStoryResult(win) {
    const panel = document.getElementById('story-result-panel');
    if (!panel) return;
    const parsed = parseChapterNode(G.activeMapNode);
    if (!win || G.isReview || !parsed) {
        panel.classList.remove('visible');
        return;
    }
    panel.classList.add('visible');
    const state = ensureMapState();
    const hero = heroForState(state);
    const story = storyById(state.storyId);
    const beat = getStoryBeat(parsed.index, parsed.branch, story);
    const isFinal = parsed.index === G.levels.length - 1;
    const progress = (parsed.index + 1) / G.levels.length;
    document.getElementById('story-result-scene').innerHTML = storyScene(story, progress, hero, beat.routeTitle);
    document.getElementById('story-result-kicker').textContent =
        isFinal ? 'ENDING UNLOCKED · 结局已抵达' : `CHAPTER ${parsed.index + 1} COMPLETE · 冒险记录`;
    document.getElementById('story-result-title').textContent = beat.routeTitle;
    const heroLine = parsed.branch === 'b' ? hero?.lineB : hero?.lineA;
    const choices = document.getElementById('story-choice-grid');
    if (isFinal) {
        const routeA = Object.values(state.choices).filter(value => value === 'a').length;
        const routeB = Object.values(state.choices).filter(value => value === 'b').length;
        const endingKey = routeB > routeA ? 'b' : 'a';
        state.ending = story.endings[endingKey];
        document.getElementById('story-result-text').textContent =
            `${beat.outcome} ${heroLine || ''} ${state.ending}`;
        choices.innerHTML = '';
        saveProgress();
        return;
    }
    document.getElementById('story-result-text').textContent = `${beat.outcome} ${heroLine || ''}`;
    const nextA = getStoryBeat(parsed.index + 1, 'a', story);
    const nextB = getStoryBeat(parsed.index + 1, 'b', story);
    choices.innerHTML = [
        { branch: 'a', beat: nextA },
        { branch: 'b', beat: nextB }
    ].map(option => {
        const mode = storyModeFor(option.branch, parsed.index + 1, state.hero);
        return `<button class="story-choice" type="button" onclick="requestStoryBranch(${parsed.index}, '${option.branch}', true)">
            <strong>${option.branch.toUpperCase()} · ${escH(option.beat.routeTitle)}</strong>
            <span>${escH(option.beat.routePrompt)}</span>
            <em>下一章：${modeLabel(mode)} · ${G.levels[parsed.index + 1].words.length} 个词</em>
        </button>`;
    }).join('');
}

function previewTeacherMap(packId) {
    const pack = (window._teacherPacks || []).find(item => item.id === packId);
    if (!pack) return toast('没有找到这个词包', 'err');
    if (!generatedStoryData(pack)) {
        generatePackStory(packId);
        return;
    }
    const words = (pack.words || []).filter(word => word?.w && word?.m);
    const levels = buildStoryLevels(words);
    const story = storyForPack(pack);
    const custom = generatedStoryData(pack);
    const heroes = Object.values(heroCatalog(pack));
    const artReady = Boolean(custom?.art?.mapImage && custom?.art?.heroImage);
    document.getElementById('teacher-map-preview-summary').innerHTML =
        `<strong style="color:var(--text);">${escH(pack.name)}</strong> 将进入
        <strong style="color:var(--gold);">《${escH(story.short)}》</strong>，并按 ${words.length} 个词生成
        <strong style="color:var(--gold);">${levels.length}</strong> 个故事章节。每章最多 10 个词，章节数随词量自动增加，
        学生先选择主角，再在每次通关后决定 A/B 剧情路线；这份内容由全体学生共用，不会重复生成。`;
    document.getElementById('teacher-map-preview-body').innerHTML = `
        <div style="padding:12px;border:1px solid var(--border);margin-bottom:12px;background:var(--bg);font-size:12px;line-height:1.8;">
            <strong style="color:var(--gold);">专属主角</strong> · ${heroes.map(hero => escH(hero.name)).join('　')}
            <br><strong style="color:${artReady ? 'var(--green)' : 'var(--gold)'};">美术资源</strong> ·
            ${artReady ? '专属地图和人物立绘已永久保存' : '当前使用备用美术，点击下方按钮重试图片生成'}
        </div>
        ${levels.map((level, index) => {
        if (index === 0) {
            return `<div class="teacher-map-stage">
                <div class="story-main">第 1 章<br><span style="color:var(--dim)">${level.words.length} 个词</span></div>
                <div class="story-a" style="grid-column:span 2;">${escH(getStoryBeat(0, 'a', story).title)}<br><span style="color:var(--dim)">三位主角从同一事件出发</span></div>
            </div>`;
        }
        const routeA = getStoryBeat(index, 'a', story);
        const routeB = getStoryBeat(index, 'b', story);
        return `<div class="teacher-map-stage">
            <div class="story-main">第 ${index + 1} 章<br><span style="color:var(--dim)">${level.words.length} 个词</span></div>
            <div class="story-a">A · ${escH(routeA.routeTitle)}<br><span style="color:var(--dim)">${modeLabel(storyModeFor('a', index, 'aria'))}</span></div>
            <div class="story-b">B · ${escH(routeB.routeTitle)}<br><span style="color:var(--dim)">${modeLabel(storyModeFor('b', index, 'sora'))}</span></div>
        </div>`;
    }).join('')}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">
            <span class="btn btn-xs btn-purple" style="cursor:default;">▤ 遗迹译文室</span>
            <span class="btn btn-xs btn-gray" style="cursor:default;">↺ 记忆修复舱</span>
            <span class="btn btn-xs btn-gold" style="cursor:default;">♛ 命运守卫战</span>
        </div>
        ${custom && !artReady
            ? `<button class="btn btn-gold" style="width:100%;margin-top:12px;" onclick="generatePackStory('${escQ(pack.id)}', true)">重新生成缺失的地图与人物图</button>`
            : ''}`;
    openModal('m-map-preview');
}

function summarizeStudentMap(prog, pack) {
    const words = Array.isArray(pack?.words) ? pack.words.filter(word => word?.w && word?.m) : [];
    const levels = buildStoryLevels(words);
    const state = prog?.mapState;
    if (!state?.completed || !/^story-map-v[23]:/.test(String(state.version || ''))) {
        return { done: Math.min(levels.length, prog?.cleared?.length || 0), total: levels.length + 3, next: '选择主角，开启词包冒险' };
    }
    let chapterDone = 0;
    for (let index = 0; index < levels.length; index++) {
        const id = index === 0 ? 'chapter-0' : `chapter-${index}-${state.choices?.[index - 1] || 'a'}`;
        if (state.completed[id]) chapterDone++;
        else {
            const nextBeat = getStoryBeat(index, state.choices?.[index - 1] || 'a', storyForPack(pack));
            return { done: chapterDone, total: levels.length + 3, next: state.hero ? nextBeat.routeTitle : '选择主角' };
        }
    }
    const extras = ['context', 'review', 'boss'].filter(id => state.completed[id]).length;
    let next = '命运守卫战';
    if (!state.completed.context) next = '遗迹译文室';
    else if (!state.completed.review) next = '记忆修复舱';
    return { done: chapterDone + extras, total: levels.length + 3, next };
}
