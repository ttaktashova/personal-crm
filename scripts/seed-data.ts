// Deterministic generator of realistic test contacts (Russian names and texts).

import type { NewContact, NewInteraction } from "../src/db/schema";
import { CONTACT_FREQUENCIES } from "../src/lib/contact-frequency";

// A contact with its revenge history: one record per dated note, as the notes migration would copy.
export type SeedContact = {
  contact: NewContact;
  interactions: Pick<NewInteraction, "occurredOn" | "summary">[];
  // Where in the list of existing groups each of the contact's groups stands: numbers from 0
  // up to 1, 0 to 3 of them. The seed script turns them into real groups, because the
  // generator does not know which groups the database has. Equal picks make one group.
  groupPicks: number[];
};

type Gender = "m" | "f";
type Random = () => number;

// mulberry32: tiny seeded PRNG, so every run produces the same data.
function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function chance(random: Random, probability: number): boolean {
  return random() < probability;
}

function randomInt(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

// "[masculine|feminine]" picks the form that matches the contact's gender.
function gendered(text: string, gender: Gender): string {
  return text.replace(/\[([^|\]]*)\|([^\]]*)\]/g, (_, male: string, female: string) =>
    gender === "m" ? male : female,
  );
}

const MALE_NAMES = [
  "Александр",
  "Алексей",
  "Андрей",
  "Антон",
  "Аркадий",
  "Арсений",
  "Артём",
  "Борис",
  "Вадим",
  "Валентин",
  "Василий",
  "Виктор",
  "Виталий",
  "Владимир",
  "Владислав",
  "Вячеслав",
  "Геннадий",
  "Георгий",
  "Глеб",
  "Григорий",
  "Даниил",
  "Денис",
  "Дмитрий",
  "Евгений",
  "Егор",
  "Иван",
  "Игорь",
  "Илья",
  "Кирилл",
  "Константин",
  "Лев",
  "Леонид",
  "Максим",
  "Марк",
  "Матвей",
  "Михаил",
  "Никита",
  "Николай",
  "Олег",
  "Павел",
  "Пётр",
  "Ринат",
  "Роман",
  "Руслан",
  "Семён",
  "Сергей",
  "Станислав",
  "Степан",
  "Тимофей",
  "Тимур",
  "Фёдор",
  "Филипп",
  "Эдуард",
  "Юрий",
  "Ярослав",
] as const;

const FEMALE_NAMES = [
  "Александра",
  "Алёна",
  "Алина",
  "Алиса",
  "Анастасия",
  "Ангелина",
  "Анна",
  "Валентина",
  "Валерия",
  "Варвара",
  "Василиса",
  "Вера",
  "Вероника",
  "Виктория",
  "Галина",
  "Дарья",
  "Диана",
  "Евгения",
  "Екатерина",
  "Елена",
  "Елизавета",
  "Есения",
  "Жанна",
  "Злата",
  "Зоя",
  "Инна",
  "Ирина",
  "Кира",
  "Ксения",
  "Лариса",
  "Лидия",
  "Любовь",
  "Людмила",
  "Маргарита",
  "Марина",
  "Мария",
  "Милана",
  "Надежда",
  "Наталья",
  "Нина",
  "Оксана",
  "Олеся",
  "Ольга",
  "Полина",
  "Регина",
  "Светлана",
  "София",
  "Таисия",
  "Тамара",
  "Татьяна",
  "Ульяна",
  "Эльвира",
  "Юлия",
  "Яна",
] as const;

// Masculine forms; feminine forms are derived in feminineSurname().
const SURNAMES = [
  "Абрамов",
  "Абрамян",
  "Акимов",
  "Александров",
  "Алексеев",
  "Алиев",
  "Андреев",
  "Анисимов",
  "Антонов",
  "Архипов",
  "Афанасьев",
  "Баранов",
  "Белов",
  "Белоусов",
  "Беляев",
  "Бирюков",
  "Блинов",
  "Богданов",
  "Бондаренко",
  "Борисов",
  "Быков",
  "Васильев",
  "Виноградов",
  "Вишневский",
  "Власов",
  "Волков",
  "Воробьёв",
  "Воронин",
  "Воронцов",
  "Гаврилов",
  "Галкин",
  "Гарипов",
  "Герасимов",
  "Голубев",
  "Гончаров",
  "Горбунов",
  "Гордеев",
  "Грачёв",
  "Григорьев",
  "Гришин",
  "Громов",
  "Гусев",
  "Давыдов",
  "Данилов",
  "Денисов",
  "Дмитриев",
  "Егоров",
  "Емельянов",
  "Ермаков",
  "Ефимов",
  "Ефремов",
  "Жуков",
  "Журавлёв",
  "Зайцев",
  "Захаров",
  "Зуев",
  "Иванов",
  "Ильин",
  "Исаев",
  "Казаков",
  "Калинин",
  "Карпов",
  "Киселёв",
  "Ким",
  "Кириллов",
  "Климов",
  "Князев",
  "Ковалёв",
  "Ковальский",
  "Козлов",
  "Колесников",
  "Комаров",
  "Кондратьев",
  "Коновалов",
  "Королёв",
  "Котов",
  "Крылов",
  "Кудрявцев",
  "Кузнецов",
  "Кузьмин",
  "Куликов",
  "Лазарев",
  "Лебедев",
  "Левин",
  "Леонов",
  "Лисицын",
  "Лукьянов",
  "Макаров",
  "Максимов",
  "Малышев",
  "Мамедов",
  "Марков",
  "Мартынов",
  "Маслов",
  "Матвеев",
  "Медведев",
  "Мельников",
  "Миронов",
  "Митрофанов",
  "Михайлов",
  "Михеев",
  "Моисеев",
  "Морозов",
  "Назаров",
  "Наумов",
  "Нестеров",
  "Никитин",
  "Никифоров",
  "Николаев",
  "Новиков",
  "Овчинников",
  "Орлов",
  "Осипов",
  "Островский",
  "Павлов",
  "Панов",
  "Петров",
  "Петросян",
  "Покровский",
  "Поляков",
  "Пономарёв",
  "Попов",
  "Потапов",
  "Прокофьев",
  "Прохоров",
  "Родионов",
  "Романов",
  "Румянцев",
  "Савельев",
  "Савин",
  "Седых",
  "Семёнов",
  "Сергеев",
  "Сидоров",
  "Симонов",
  "Скворцов",
  "Смирнов",
  "Соболев",
  "Соколов",
  "Соловьёв",
  "Сорокин",
  "Степанов",
  "Тарасов",
  "Тимофеев",
  "Титов",
  "Тихомиров",
  "Тихонов",
  "Ткаченко",
  "Трофимов",
  "Фёдоров",
  "Федотов",
  "Филатов",
  "Филиппов",
  "Фомин",
  "Фролов",
  "Хабибуллин",
  "Харитонов",
  "Цветков",
  "Цой",
  "Чернов",
  "Черных",
  "Чернышёв",
  "Шевченко",
  "Шестаков",
  "Щербаков",
  "Юдин",
  "Яковлев",
] as const;

const PATRONYMICS: readonly (readonly [string, string])[] = [
  ["Александрович", "Александровна"],
  ["Алексеевич", "Алексеевна"],
  ["Анатольевич", "Анатольевна"],
  ["Андреевич", "Андреевна"],
  ["Борисович", "Борисовна"],
  ["Викторович", "Викторовна"],
  ["Владимирович", "Владимировна"],
  ["Геннадьевич", "Геннадьевна"],
  ["Дмитриевич", "Дмитриевна"],
  ["Евгеньевич", "Евгеньевна"],
  ["Игоревич", "Игоревна"],
  ["Михайлович", "Михайловна"],
  ["Николаевич", "Николаевна"],
  ["Олегович", "Олеговна"],
  ["Петрович", "Петровна"],
  ["Сергеевич", "Сергеевна"],
  ["Юрьевич", "Юрьевна"],
];

function feminineSurname(surname: string): string {
  if (/(ский|цкий)$/.test(surname)) return surname.slice(0, -2) + "ая";
  if (/(ов|ев|ёв|ин|ын)$/.test(surname)) return surname + "а";
  return surname; // Шевченко, Ким, Черных, Петросян do not change
}

// "where" is the prepositional phrase ("в компании ..."), "from" the genitive one ("из компании ...").
const COMPANIES = [
  {
    name: "«Альфа-Проект»",
    where: "в компании «Альфа-Проект»",
    from: "из компании «Альфа-Проект»",
    domain: "alfaproekt.ru",
  },
  {
    name: "«Северстрой»",
    where: "в «Северстрое»",
    from: "из «Северстроя»",
    domain: "severstroy.ru",
  },
  {
    name: "«Пиксель»",
    where: "в агентстве «Пиксель»",
    from: "из агентства «Пиксель»",
    domain: "pixel-agency.ru",
  },
  {
    name: "«НордТех»",
    where: "в компании «НордТех»",
    from: "из компании «НордТех»",
    domain: "nordtech.io",
  },
  { name: "«Меридиан»", where: "в «Меридиане»", from: "из «Меридиана»", domain: "meridian.ru" },
  {
    name: "«Вектор»",
    where: "в группе компаний «Вектор»",
    from: "из группы компаний «Вектор»",
    domain: "vector-group.ru",
  },
  {
    name: "«Сфера Медиа»",
    where: "в холдинге «Сфера Медиа»",
    from: "из холдинга «Сфера Медиа»",
    domain: "sferamedia.ru",
  },
  {
    name: "«Компас Логистик»",
    where: "в компании «Компас Логистик»",
    from: "из компании «Компас Логистик»",
    domain: "kompas-log.ru",
  },
  {
    name: "«Восток»",
    where: "в банке «Восток»",
    from: "из банка «Восток»",
    domain: "vostokbank.ru",
  },
  {
    name: "«Ракета Диджитал»",
    where: "в студии «Ракета Диджитал»",
    from: "из студии «Ракета Диджитал»",
    domain: "raketa.digital",
  },
  { name: "«Квант»", where: "в «Кванте»", from: "из «Кванта»", domain: "kvant-soft.ru" },
  {
    name: "«Гринлайн»",
    where: "в компании «Гринлайн»",
    from: "из компании «Гринлайн»",
    domain: "greenline.ru",
  },
] as const;

const UNIVERSITIES = [
  "МГУ",
  "СПбГУ",
  "МФТИ",
  "ВШЭ",
  "Бауманке",
  "УрФУ",
  "НГУ",
  "КФУ",
  "РУДН",
  "МИСиС",
];
const CITIES = [
  "Москву",
  "Петербург",
  "Казань",
  "Екатеринбург",
  "Новосибирск",
  "Нижний Новгород",
  "Самару",
  "Краснодар",
  "Калининград",
  "Тбилиси",
  "Ереван",
  "Сочи",
];
const HIKES = [
  "на Алтай",
  "в Карелию",
  "на Байкал",
  "в Хибины",
  "на Эльбрус",
  "на Кавказ",
  "по Камчатке",
];
const PLACES_TO = [
  "на Алтай",
  "в Карелию",
  "на Байкал",
  "в Грузию",
  "в Армению",
  "в Дагестан",
  "на Камчатку",
  "в Териберку",
  "в Хибины",
  "на Эльбрус",
  "в Стамбул",
  "в Калининград",
];
const FEMALE_FRIENDS_GENITIVE = ["Маши", "Кати", "Ани", "Оли", "Насти", "Лены"];
const MALE_FRIENDS_GENITIVE = ["Димы", "Сергея", "Лёши", "Андрея", "Миши", "Саши"];
const FRIENDS_GENITIVE = [...FEMALE_FRIENDS_GENITIVE, ...MALE_FRIENDS_GENITIVE];
const KIDS_GENITIVE = ["Вани", "Лизы", "Миши", "Сони", "Тёмы", "Алисы", "Даши", "Феди"];
const TOPICS_DATIVE = [
  "аналитике данных",
  "управлению продуктом",
  "дизайну",
  "маркетингу",
  "фронтенду",
  "финтеху",
  "образованию",
  "HR",
];
const ACTIVITIES = [
  "на йогу",
  "в бассейн",
  "на скалодром",
  "на пробежки по субботам",
  "на волейбол",
  "в танцевальную студию",
  "на курсы английского",
  "в хор",
  "на гончарный курс",
  "в книжный клуб",
  "на шахматы",
];
const DEPARTMENTS = [
  "отдел продаж",
  "бухгалтерия",
  "маркетинг",
  "разработка",
  "HR",
  "юристы",
  "поддержка",
  "дизайн",
  "аналитика",
  "закупки",
];
const STREETS = ["Профсоюзной", "Ленина", "Садовой", "Мира", "Гагарина", "Лесной"];
const VILLAGES = ["Кратово", "Снегирях", "Рощино", "Комарово", "Валдае", "Абрамцево"];

type Category = {
  weight: number;
  formal?: boolean; // more often written with a patronymic
  templates: ((random: Random) => string)[];
};

const CATEGORIES: Category[] = [
  {
    weight: 22,
    templates: [
      (r) => `Коллега по работе ${pick(r, COMPANIES).where}, ${pick(r, DEPARTMENTS)}`,
      (r) => {
        const from = randomInt(r, 2012, 2022);
        return `Работали вместе ${pick(r, COMPANIES).where} в ${from}–${from + randomInt(r, 1, 4)}`;
      },
      (r) => `Бывш[ий|ая] руководитель ${pick(r, COMPANIES).where}`,
      (r) => `Клиент[|ка] ${pick(r, COMPANIES).from}, вели совместный проект`,
      () => "Подрядчик, делал[|а] нам сайт",
      (r) => `Рекрутер ${pick(r, COMPANIES).from}, звал[|а] на работу`,
    ],
  },
  {
    weight: 12,
    templates: [
      (r) => `Однокурсни[к|ца] по ${pick(r, UNIVERSITIES)}`,
      (r) => `Учились в одной группе в ${pick(r, UNIVERSITIES)}`,
      (r) => `Жили в одной общаге в ${pick(r, UNIVERSITIES)}`,
      (r) => `Научный руководитель в ${pick(r, UNIVERSITIES)}`,
    ],
  },
  {
    weight: 8,
    templates: [
      (r) => `Одноклассни[к|ца], школа № ${randomInt(r, 1, 1500)}`,
      (r) => `Учились в параллельных классах, школа № ${randomInt(r, 1, 1500)}`,
      (r) =>
        `Учител[ь|ьница] ${pick(r, ["математики", "литературы", "физики", "истории", "английского"])} в школе у детей`,
    ],
  },
  {
    weight: 10,
    templates: [
      () => "[Друг|Подруга] детства, жили в одном дворе",
      (r) => `[Брат|Сестра] ${pick(r, FRIENDS_GENITIVE)}`,
      (r) => `[Муж ${pick(r, FEMALE_FRIENDS_GENITIVE)}|Жена ${pick(r, MALE_FRIENDS_GENITIVE)}]`,
      (r) => `Знаком[ый|ая] ${pick(r, FRIENDS_GENITIVE)}, познакомились у них на дне рождения`,
      (r) => `[Друг|Подруга] семьи, знакомы с ${randomInt(r, 2005, 2020)} года`,
      () => "Двоюродн[ый брат|ая сестра]",
    ],
  },
  {
    weight: 8,
    templates: [
      () => "Сосед[|ка] по подъезду",
      (r) => `Сосед[|ка] по даче в ${pick(r, VILLAGES)}`,
      () => "Сосед[|ка] по лестничной площадке",
      () => "Живёт в соседнем доме, пересекаемся на прогулках с собаками",
    ],
  },
  {
    weight: 8,
    templates: [
      (r) => `Вместе ходим ${pick(r, ACTIVITIES)}`,
      (r) => `Тренер по ${pick(r, ["плаванию", "теннису", "боксу", "бегу", "лыжам"])}`,
      (r) =>
        `Познакомились на забеге ${pick(r, ["в Лужниках", "«Белые ночи»", "в Казани", "в Сочи"])}`,
      () => "Из клуба настольных игр",
      () => "Играем вместе в футбол по четвергам",
    ],
  },
  {
    weight: 8,
    templates: [
      (r) => `Познакомились в поездке ${pick(r, PLACES_TO)} в ${randomInt(r, 2015, 2025)}`,
      (r) =>
        `Попутчи[к|ца] в поезде ${pick(r, ["Москва — Казань", "Москва — Санкт-Петербург", "Новосибирск — Иркутск", "Москва — Мурманск"])}`,
      (r) => `Вместе ходили в поход ${pick(r, HIKES)}`,
    ],
  },
  {
    weight: 9,
    templates: [
      (r) =>
        `Познакомились на конференции по ${pick(r, TOPICS_DATIVE)} в ${randomInt(r, 2018, 2026)}`,
      (r) => `Познакомились на митапе по ${pick(r, TOPICS_DATIVE)}`,
      (r) => `Познакомились на свадьбе у ${pick(r, FRIENDS_GENITIVE)}`,
      (r) =>
        `Сидели рядом на курсе ${pick(r, ["по Python", "по UX-дизайну", "по фотографии", "итальянского", "по финансовой грамотности"])}`,
    ],
  },
  {
    weight: 10,
    formal: true,
    templates: [
      (r) => `Стоматолог в клинике ${pick(r, ["«Улыбка»", "«Дентал Профи»", "«Белый зуб»"])}`,
      (r) => `Автомеханик, сервис на ${pick(r, STREETS)}`,
      () => "Мастер, делал[|а] ремонт у нас на кухне",
      (r) =>
        `Репетитор по ${pick(r, ["математике", "английскому", "физике", "химии", "русскому"])} для ${pick(r, ["сына", "дочки", "племянника"])}`,
      () => "Риелтор, помогал[|а] снять квартиру",
      () => "Ветеринар, лечил[|а] кота",
      () => "Юрист, консультировал[|а] по договору аренды",
      () => "Бухгалтер, помогает с декларацией",
      () => "Фотограф на нашей свадьбе",
      () => "Семейный врач в поликлинике",
    ],
  },
  {
    weight: 5,
    templates: [
      () => "[Папа|Мама] одноклассника сына",
      (r) => `[Папа|Мама] ${pick(r, KIDS_GENITIVE)} из садика`,
      () => "Познакомились на детской площадке",
    ],
  },
];

const NOTE_TEMPLATES: ((random: Random) => string)[] = [
  (r) =>
    `Созвонились, обсудили ${pick(r, ["переезд", "новую работу", "поездку летом", "ремонт", "идею совместного проекта", "учёбу детей", "покупку машины", "отпуск"])}. Договорились созвониться ${pick(r, ["через месяц", "после праздников", "в начале следующего месяца", "на следующей неделе", "ближе к лету"])}.`,
  (r) =>
    `Встретились на кофе. [Он|Она] сейчас ${pick(r, ["ищет работу в продукте", "запускает свой бизнес", "учит испанский", `переезжает в ${pick(r, CITIES)}`, "строит дом за городом", "готовится к марафону", "пишет диссертацию"])}.`,
  (r) =>
    `Обещал[|а] прислать ${pick(r, ["контакты хорошего стоматолога", "презентацию с конференции", "фото с поездки", "ссылку на курс по SQL", "рецепт пирога", "список книг по истории"])}.`,
  (r) =>
    `С меня: ${pick(r, ["познакомить с юристом", "скинуть резюме знакомого дизайнера", "вернуть книгу", "найти контакты риелтора", "передать подарок для детей"])}.`,
  (r) =>
    `Договорились: ${pick(r, ["встретиться в субботу в 12:00 у метро", "вместе поехать на дачу в июле", "созвониться по проекту во вторник", "сходить на выставку в Пушкинский музей", "в следующий раз встречаемся у нас"])}.`,
  (r) =>
    `День рождения ${randomInt(r, 1, 28)} ${pick(r, ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"])}. Любит ${pick(r, ["хороший чай", "настолки", "книги по истории", "джаз", "сладкое", "комнатные растения", "кофе в зёрнах"])}.`,
  (r) =>
    `Дети: ${pick(r, ["сын Миша, 7 лет", "две дочки, Аня и Соня", "сын в 9 классе, готовится к ОГЭ", "дочка Вера, ходит в садик", "детей нет, есть кот Бублик"])}.`,
  (r) =>
    `Занял[|а] ${pick(r, ["5 000", "10 000", "15 000", "3 000"])} ₽, вернёт до ${randomInt(r, 1, 28)}-го.`,
  (r) =>
    `Помог[|ла] с ${pick(r, ["переездом", "выбором ноутбука", "документами для визы", "ремонтом машины", "резюме"])}. Надо отблагодарить.`,
  (r) =>
    `Посоветовал[|а] ${pick(r, ["хорошего врача-ортопеда", `автосервис на ${pick(r, STREETS)}`, "курс по финансовой грамотности", "съездить в Карелию осенью"])}.`,
  () => "Не пьёт алкоголь — встречаться лучше в кофейне.",
  (r) =>
    `Поздравили с ${pick(r, ["новой работой", "рождением дочки", "свадьбой", "новосельем", "защитой диплома"])}.`,
];

const TRANSLIT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function transliterate(text: string): string {
  return Array.from(text.toLowerCase(), (char) => TRANSLIT[char] ?? char).join("");
}

const PERSONAL_DOMAINS = [
  "gmail.com",
  "gmail.com",
  "yandex.ru",
  "yandex.ru",
  "mail.ru",
  "ya.ru",
  "icloud.com",
  "outlook.com",
];

function makeEmail(
  random: Random,
  firstName: string,
  surname: string,
  workDomain: string | null,
): string {
  const first = transliterate(firstName);
  const last = transliterate(surname);
  const local = pick(random, [
    `${first}.${last}`,
    `${first[0]}.${last}`,
    `${last}${randomInt(random, 70, 99)}`,
    `${first}${last[0]}`,
    `${first}_${last}`,
  ]);
  const domain = workDomain && chance(random, 0.7) ? workDomain : pick(random, PERSONAL_DOMAINS);
  return `${local}@${domain}`;
}

function makePhone(random: Random): string {
  const digits = (count: number) =>
    Array.from({ length: count }, () => randomInt(random, 0, 9)).join("");
  const roll = random();
  if (roll < 0.04) return `+375 29 ${digits(3)}-${digits(2)}-${digits(2)}`;
  if (roll < 0.07) return `+995 5${digits(2)} ${digits(3)} ${digits(3)}`;
  const operator = `9${digits(2)}`;
  if (roll < 0.2) return `8 (${operator}) ${digits(3)}-${digits(2)}-${digits(2)}`;
  return `+7 ${operator} ${digits(3)}-${digits(2)}-${digits(2)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_CONTACT_DATE = Date.UTC(2023, 0, 10);
const LAST_CONTACT_DATE = Date.UTC(2026, 8, 30);
const LAST_NOTE_DATE = Date.UTC(2026, 9, 8);

function formatNoteDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

// "YYYY-MM-DD" for a date column.
function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Working hours, so timestamps look like real edits.
function randomTimeOfDay(random: Random, dayStart: number): Date {
  return new Date(dayStart + randomInt(random, 6 * 60, 18 * 60) * 60 * 1000);
}

function pickCategory(random: Random): Category {
  const total = CATEGORIES.reduce((sum, category) => sum + category.weight, 0);
  let roll = random() * total;
  for (const category of CATEGORIES) {
    roll -= category.weight;
    if (roll < 0) return category;
  }
  return CATEGORIES[CATEGORIES.length - 1];
}

// About 60 % of the people are in a group: mostly one, sometimes two, rarely three.
function pickGroups(random: Random): number[] {
  if (!chance(random, 0.6)) return [];
  const count = 1 + (chance(random, 0.35) ? 1 : 0) + (chance(random, 0.15) ? 1 : 0);
  return Array.from({ length: count }, () => random());
}

export function generateContacts(count: number, seed = 20261009): SeedContact[] {
  const random = createRandom(seed);
  // A separate sequence for the reminder frequency, so names, notes and history
  // stay exactly as they were before contacts had a frequency.
  const frequencyRandom = createRandom(seed + 1);
  // And one more for the groups, for the same reason.
  const groupRandom = createRandom(seed + 2);
  const usedNames = new Set<string>();
  const result: SeedContact[] = [];

  while (result.length < count) {
    const gender: Gender = chance(random, 0.5) ? "m" : "f";
    const firstName = pick(random, gender === "m" ? MALE_NAMES : FEMALE_NAMES);
    const baseSurname = pick(random, SURNAMES);
    const surname = gender === "m" ? baseSurname : feminineSurname(baseSurname);
    const category = pickCategory(random);

    const patronymic =
      category.formal && chance(random, 0.5)
        ? pick(random, PATRONYMICS)[gender === "m" ? 0 : 1]
        : null;
    const name = patronymic ? `${firstName} ${patronymic} ${surname}` : `${firstName} ${surname}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);

    const howWeMet = chance(random, 0.93)
      ? gendered(pick(random, category.templates)(random), gender)
      : "";

    const workDomain = COMPANIES.find((company) => howWeMet.includes(company.name))?.domain ?? null;

    const createdDay =
      FIRST_CONTACT_DATE +
      Math.floor((random() * (LAST_CONTACT_DATE - FIRST_CONTACT_DATE)) / DAY_MS) * DAY_MS;
    const createdAt = randomTimeOfDay(random, createdDay);

    const noteCount = chance(random, 0.68) ? randomInt(random, 1, 4) : 0;
    const noteDays = Array.from({ length: noteCount }, () => {
      const span = Math.max(LAST_NOTE_DATE - createdDay, DAY_MS);
      return createdDay + Math.floor((random() * span) / DAY_MS) * DAY_MS;
    }).sort((a, b) => a - b);

    const datedNotes = noteDays.map((day) => ({
      date: new Date(day),
      text: gendered(pick(random, NOTE_TEMPLATES)(random), gender),
    }));
    const notes = datedNotes
      .map(({ date, text }) => `${formatNoteDate(date)} — ${text}`)
      .join("\n\n");

    const lastNoteDay = noteDays.at(-1);
    const updatedAt =
      lastNoteDay !== undefined && lastNoteDay > createdDay
        ? randomTimeOfDay(random, lastNoteDay)
        : createdAt;

    result.push({
      contact: {
        name,
        howWeMet,
        phone: chance(random, 0.9) ? makePhone(random) : "",
        email: chance(random, 0.72) ? makeEmail(random, firstName, surname, workDomain) : "",
        notes,
        // About a quarter, so "Пора мстить" has people with and without history.
        contactFrequency: chance(frequencyRandom, 0.25)
          ? pick(frequencyRandom, CONTACT_FREQUENCIES)
          : null,
        createdAt,
        updatedAt,
      },
      interactions: datedNotes.map(({ date, text }) => ({
        occurredOn: formatIsoDate(date),
        summary: text,
      })),
      groupPicks: pickGroups(groupRandom),
    });
  }

  return result;
}
