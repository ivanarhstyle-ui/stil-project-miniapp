
const STIL_SEED = {
  projects: [
    {
      id: "efimova21",
      code: "2247-26",
      title: "Ефимова, 21",
      objectName: "Многоквартирная жилая застройка с подземной автостоянкой и нежилыми помещениями",
      address: "г. Тверь, ул. Ефимова, д. 21",
      client: "ООО «Регионстрой»",
      currentStage: "P",
      contractValue: 6340000,
      stages: [
        { id:"concept", title:"Концепция", value:250000, status:"done", note:"Посадка здания" },
        { id:"add1", title:"Доп. соглашение №1", value:100000, status:"done", note:"Акт подписан 08.06.2026" },
        { id:"sketch", title:"Эскиз", value:950000, status:"done", note:"Фасад, план, разрез" },
        { id:"P", title:"Стадия П", value:2500000, status:"work", note:"Проектная документация" },
        { id:"RD", title:"Стадия РД", value:2540000, status:"todo", note:"Рабочая документация" }
      ],
      sections: [
        {id:"p-pz",stage:"P",code:"ПЗ",name:"Пояснительная записка",executor:"Иван Булатов",status:"work",advance:20000,closing:20000},
        {id:"p-pzu",stage:"P",code:"ПЗУ",name:"Схема планировочной организации земельного участка",executor:"Иван Булатов, Осокина",status:"work",advance:75000,closing:75000},
        {id:"p-ar",stage:"P",code:"АР",name:"Объемно-планировочные и архитектурные решения",executor:"Иван Булатов",status:"work",advance:250000,closing:250000},
        {id:"p-kr",stage:"P",code:"КР",name:"Конструктивные решения",executor:"Каляскин (монолит), кирпич — наши",status:"work",advance:500000,closing:500000},
        {id:"p-ios1",stage:"P",code:"ИОС1",name:"Система электроснабжения",executor:"Елена Виноградова",status:"work",advance:50000,closing:50000},
        {id:"p-ios2",stage:"P",code:"ИОС2",name:"Система водоснабжения",executor:"Полина Пшенова",status:"work",advance:50000,closing:50000},
        {id:"p-ios3",stage:"P",code:"ИОС3",name:"Система водоотведения",executor:"Полина Пшенова",status:"work",advance:50000,closing:50000},
        {id:"p-ios4",stage:"P",code:"ИОС4",name:"Отопление, вентиляция и кондиционирование воздуха",executor:"",status:"todo",advance:60000,closing:60000},
        {id:"p-ios5",stage:"P",code:"ИОС5",name:"Сети связи",executor:"Сергей Папарунас",status:"work",advance:20000,closing:20000},
        {id:"p-ios6",stage:"P",code:"ИОС6",name:"Система газоснабжения",executor:"Леля Валерьевна",status:"waiting",advance:50000,closing:50000},
        {id:"p-th",stage:"P",code:"ТХ",name:"Технологические решения",executor:"",status:"todo",advance:25000,closing:25000},
        {id:"p-pos",stage:"P",code:"ПОС",name:"Проект организации строительства",executor:"",status:"todo",advance:25000,closing:25000},
        {id:"p-oos",stage:"P",code:"ООС",name:"Мероприятия по охране окружающей среды",executor:"Белибуха",status:"work",advance:25000,closing:25000},
        {id:"p-pb",stage:"P",code:"ПБ",name:"Мероприятия по обеспечению пожарной безопасности",executor:"Плешков",status:"work",advance:25000,closing:25000},
        {id:"p-tbe",stage:"P",code:"ТБЭ",name:"Требования к безопасной эксплуатации",executor:"",status:"todo",advance:15000,closing:15000},
        {id:"p-odi",stage:"P",code:"ОДИ",name:"Мероприятия по обеспечению доступа инвалидов",executor:"",status:"todo",advance:10000,closing:10000},

        {id:"rd-gp",stage:"RD",code:"ГП",name:"Генеральный план",executor:"",status:"todo",advance:80000,closing:80000},
        {id:"rd-ar",stage:"RD",code:"АР",name:"Архитектурные решения",executor:"",status:"todo",advance:250000,closing:250000},
        {id:"rd-kr",stage:"RD",code:"КР/КЖ",name:"Конструктивные решения / железобетонные конструкции",executor:"",status:"todo",advance:500000,closing:500000},
        {id:"rd-eom",stage:"RD",code:"ЭОМ",name:"Электроснабжение внутреннее",executor:"",status:"todo",advance:65000,closing:65000},
        {id:"rd-es",stage:"RD",code:"ЭС",name:"Электроснабжение — наружные сети",executor:"",status:"todo",advance:15000,closing:15000},
        {id:"rd-ss",stage:"RD",code:"СС",name:"Сети связи / пожарная сигнализация",executor:"",status:"todo",advance:20000,closing:20000},
        {id:"rd-vk",stage:"RD",code:"ВК",name:"Водопровод и канализация внутренние",executor:"",status:"todo",advance:85000,closing:85000},
        {id:"rd-nvk",stage:"RD",code:"НВК",name:"Водопровод и канализация — наружные сети",executor:"",status:"todo",advance:15000,closing:15000},
        {id:"rd-ov",stage:"RD",code:"ОВ",name:"Отопление и вентиляция",executor:"",status:"todo",advance:170000,closing:170000},
        {id:"rd-gsv",stage:"RD",code:"ГСВ",name:"Газоснабжение внутреннее",executor:"",status:"todo",advance:50000,closing:50000},
        {id:"rd-gsn",stage:"RD",code:"ГСН",name:"Газоснабжение — наружные сети",executor:"",status:"todo",advance:20000,closing:20000}
      ],
      initialData: [
        {id:"irdi-igdi",title:"ИГДИ — инженерно-геодезические изыскания",provider:"Проектная команда",status:"waiting"},
        {id:"irdi-igi",title:"ИГИ — инженерно-геологические изыскания",provider:"Проектная команда",status:"waiting"},
        {id:"irdi-iei",title:"ИЭИ — инженерно-экологические изыскания",provider:"Проектная команда",status:"waiting"},
        {id:"irdi-igmi",title:"Инженерно-гидрометеорологические изыскания",provider:"",status:"na"},
        {id:"irdi-gpzu",title:"ГПЗУ",provider:"Заказчик",status:"waiting"},
        {id:"irdi-land",title:"Документы на землю",provider:"Заказчик",status:"waiting"},
        {id:"irdi-gas",title:"ТУ — газ",provider:"Заказчик",status:"waiting",blocks:["p-ios6","rd-gsv","rd-gsn"]},
        {id:"irdi-water",title:"ТУ — вода",provider:"Заказчик",status:"waiting",blocks:["p-ios2","rd-vk","rd-nvk"]},
        {id:"irdi-sewer",title:"ТУ — водоотведение",provider:"Заказчик",status:"waiting",blocks:["p-ios3","rd-vk","rd-nvk"]},
        {id:"irdi-power",title:"ТУ — электричество",provider:"Заказчик",status:"waiting",blocks:["p-ios1","rd-eom","rd-es"]},
        {id:"irdi-storm",title:"ТУ — ливневая канализация",provider:"Заказчик",status:"waiting"},
        {id:"irdi-rescue",title:"План спасательных работ",provider:"Заказчик",status:"waiting"},
        {id:"irdi-property",title:"ТУ и согласование ДУИ + центр земельных ресурсов",provider:"Заказчик",status:"waiting"},
        {id:"irdi-arshanov",title:"Проект Аршанова + согласование с ГИБДД",provider:"Заказчик",status:"waiting"},
        {id:"irdi-heritage",title:"ТУ от памятников + согласование",provider:"Заказчик",status:"waiting"}
      ],
      payments: [
        {id:"pay-concept",title:"Концепция",amount:250000,status:"paid",note:"100% предоплата"},
        {id:"pay-add1",title:"Доп. соглашение №1",amount:100000,status:"paid",note:"Акт подписан 08.06.2026"},
        {id:"pay-sketch-a",title:"Эскиз — аванс",amount:475000,status:"paid",note:"Выставлен в ЭДО"},
        {id:"pay-sketch-c",title:"Эскиз — закрытие",amount:475000,status:"waiting",note:"Счет выставлен 02.09.2026"},
        {id:"pay-p-a",title:"Стадия П — аванс",amount:1250000,status:"waiting",note:"Счет выставлен 02.09.2026"},
        {id:"pay-p-c",title:"Стадия П — закрытие",amount:1250000,status:"future",note:"После закрытия этапа"},
        {id:"pay-rd-a",title:"Стадия РД — аванс",amount:1270000,status:"future",note:"До начала этапа"},
        {id:"pay-rd-c",title:"Стадия РД — закрытие",amount:1270000,status:"future",note:"После закрытия этапа"}
      ]
    }
  ],
  tasks: [
    {id:"task1",projectId:"efimova21",title:"Установить срок по КР",detail:"Стадия П",owner:"Роман",due:"2026-09-21",priority:"critical",done:false},
    {id:"task2",projectId:"efimova21",title:"Запросить ТУ на газ",detail:"Заказчик",owner:"Роман",due:"2026-09-21",priority:"critical",done:false},
    {id:"task3",projectId:"efimova21",title:"Назначить исполнителя ИОС4",detail:"ОВиК",owner:"Роман",due:"2026-09-22",priority:"normal",done:false},
    {id:"task4",projectId:"efimova21",title:"Проверить ПЗУ",detail:"Иван Булатов / Осокина",owner:"Роман",due:"2026-09-23",priority:"normal",done:false}
  ]
};
