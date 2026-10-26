/**
 * Content for the Long March 90th anniversary section.
 *
 * Kept as plain data so the wording can be reviewed independently of the
 * screens and so the intro/battle lists can be unit-tested.
 */

export interface ArticleSection {
  id: string
  title: string
  paragraphs: string[]
}

export interface LongMarchBattle {
  id: string
  name: string
  date: string
  place: string
  summary: string
}

/** Minimum time a player must spend on the introduction before continuing. */
export const INTRO_DWELL_MS = 10_000

export function dwellSecondsLeft(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000))
}

export const LONG_MARCH_INTRO: ArticleSection[] = [
  {
    id: 'background',
    title: '历史背景：被迫的战略转移',
    paragraphs: [
      '1933年秋，国民党军对中央革命根据地发动第五次“围剿”，调集重兵，采取堡垒主义和持久消耗的战术。由于党内“左”倾教条主义错误，红军放弃了前四次反“围剿”行之有效的运动战方针，第五次反“围剿”最终失利。',
      '1934年10月，中央红军（红一方面军）主力被迫撤离中央革命根据地，开始战略转移。此后，红二十五军、红四方面军、红二军团和红六军团等也先后离开原有根据地，踏上长征之路。',
      '长征不是一次普通的行军，而是在极其严峻的生死关头，为保存革命力量、寻找新的战略落脚点而进行的战略大转移。'
    ]
  },
  {
    id: 'journey',
    title: '长征过程：二万五千里的生死行军',
    paragraphs: [
      '1934年10月，中央红军从江西于都等地出发，连续突破国民党军四道封锁线。湘江战役中，红军付出惨重代价，中央红军由出发时的8.6万余人锐减至3万余人。',
      '1935年1月，遵义会议召开，纠正了“左”倾教条主义在军事上的错误，确立了毛泽东在党中央和红军的领导地位，成为党的历史上一个生死攸关的转折点。',
      '此后，红军四渡赤水、巧渡金沙江、强渡大渡河、飞夺泸定桥，翻越夹金山等雪山，穿越茫茫草地，突破腊子口天险。1935年10月，中央红军到达陕北吴起镇。',
      '1936年10月，红一、红二、红四方面军在甘肃会宁、静宁将台堡会师，宣告长征胜利结束。红军三大主力转战十余省，总行程约二万五千里。'
    ]
  },
  {
    id: 'meaning',
    title: '历史意义：宣言书、宣传队、播种机',
    paragraphs: [
      '长征粉碎了国民党军消灭红军和革命根据地的企图，保存了党和红军的骨干力量，为中国革命由挫折走向胜利奠定了基础。',
      '长征沿途传播革命主张，播撒革命火种，扩大了党和红军的影响，密切了同人民群众的联系。',
      '长征中形成的以毛泽东同志为主要代表的正确领导，以及实事求是、独立自主解决中国革命实际问题的经验，具有深远的历史意义。',
      '毛泽东同志指出：“长征是宣言书，长征是宣传队，长征是播种机。”长征的胜利，为中国革命开辟了新的局面。'
    ]
  },
  {
    id: 'spirit',
    title: '长征精神在当下的价值',
    paragraphs: [
      '长征精神，是把全国人民和中华民族的根本利益看得高于一切，坚定革命的理想和信念，坚信正义事业必然胜利的精神；是为了救国救民，不怕任何艰难险阻，不惜付出一切牺牲的精神；是坚持独立自主、实事求是，一切从实际出发的精神；是顾全大局、严守纪律、紧密团结的精神；是紧紧依靠人民群众，同人民群众生死相依、患难与共、艰苦奋斗的精神。',
      '今天，我们比历史上任何时期都更接近中华民族伟大复兴的目标，但前进道路上仍然有许多“雪山”“草地”需要跨越，有许多“娄山关”“腊子口”需要征服。',
      '走好新时代的长征路，需要坚定理想信念，保持战略定力；需要实事求是、改革创新，脚踏实地解决实际问题；需要团结协作、严守纪律，把个人奋斗融入集体事业；需要艰苦奋斗、依靠人民，在平凡岗位上作出不平凡的贡献。',
      '纪念长征胜利90周年，不仅是回望一段历史，更是从中汲取继续前进的力量。'
    ]
  }
]

export const LONG_MARCH_BATTLES: LongMarchBattle[] = [
  {
    id: 'xiangjiang',
    name: '湘江战役',
    date: '1934年11月—12月',
    place: '广西全州、兴安、灌阳一带',
    summary:
      '中央红军突破第四道封锁线的关键一战。红军以巨大牺牲掩护中央机关和主力渡江，中央红军由8.6万余人减至3万余人。'
  },
  {
    id: 'wujiang',
    name: '强渡乌江',
    date: '1935年1月',
    place: '贵州瓮安、余庆一带',
    summary: '红军突破乌江天险，为占领遵义、召开遵义会议创造了条件。'
  },
  {
    id: 'chishui',
    name: '四渡赤水',
    date: '1935年1月—3月',
    place: '贵州、四川、云南交界地区',
    summary:
      '中央红军在毛泽东指挥下四次渡过赤水河，声东击西、灵活机动，摆脱了国民党军的围追堵截。'
  },
  {
    id: 'dadu',
    name: '强渡大渡河',
    date: '1935年5月',
    place: '四川石棉安顺场',
    summary:
      '红军十七勇士强渡大渡河，粉碎了敌人企图让红军成为“第二个石达开”的妄想。'
  },
  {
    id: 'luding',
    name: '飞夺泸定桥',
    date: '1935年5月',
    place: '四川泸定',
    summary:
      '红军二十二名勇士冒着火力攀踏铁索，夺取泸定桥，为红军北上打开了通道。'
  },
  {
    id: 'lazikou',
    name: '腊子口战役',
    date: '1935年9月',
    place: '甘肃迭部',
    summary:
      '红军突破天险腊子口，打开了北上甘南的通道，为中央红军到达陕北创造了条件。'
  },
  {
    id: 'zhiluo',
    name: '直罗镇战役',
    date: '1935年11月',
    place: '陕西富县',
    summary:
      '红军在直罗镇歼灭国民党军一部，为党中央把中国革命大本营放在西北举行了奠基礼。'
  },
  {
    id: 'shanchengbao',
    name: '山城堡战役',
    date: '1936年11月',
    place: '甘肃环县',
    summary:
      '红军长征的最后一战，迫使国民党军停止对陕甘苏区的进攻，对巩固陕甘根据地具有重要意义。'
  }
]
