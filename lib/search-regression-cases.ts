export type SearchRegressionCase = {
  query: string;
  mode: 'title' | 'structured' | 'context';
  expectation: string;
};

export const SEARCH_REGRESSION_CASES: SearchRegressionCase[] = [
  { query: 'магичиская битва', mode: 'title', expectation: 'Магическая битва' },
  { query: 'фрирен', mode: 'title', expectation: 'Фрирен' },
  { query: 'friren', mode: 'title', expectation: 'Frieren / Фрирен' },
  { query: 'ван писс', mode: 'title', expectation: 'One Piece / Ван-Пис' },
  { query: 'naruta', mode: 'title', expectation: 'Naruto / Наруто' },
  { query: '2 сезон 4 серия', mode: 'structured', expectation: 'structured season/episode intent' },
  { query: 'девушка аптекарь во дворце', mode: 'context', expectation: 'Монолог фармацевта' },
  { query: 'эльфийка путешествует после смерти героя', mode: 'context', expectation: 'Фрирен' },
  { query: 'парень переродился слизью', mode: 'context', expectation: 'О моём перерождении в слизь' },
];
