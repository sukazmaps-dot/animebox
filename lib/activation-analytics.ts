export type ActivationRange = 7 | 30;

export type ActivationStage = {
  key: string;
  label: string;
  sessions: number;
  rateFromPrevious: number | null;
  rateFromVisits: number;
};

export type ActivationSurface = {
  source: string;
  authOpened: number;
  authCompleted: number;
  registrations: number;
  playerStarts: number;
};

export type ActivationDashboard = {
  rangeDays: ActivationRange;
  generatedAt: string;
  dataSince: string | null;
  sampledEvents: number;
  truncated: boolean;
  kpis: {
    visitSessions: number;
    authOpenedSessions: number;
    authCompletedSessions: number;
    registrationSessions: number;
    onboardingCompletedSessions: number;
    animeOpenSessions: number;
    playerStartSessions: number;
    authCompletionRate: number;
    visitToPlayRate: number;
  };
  funnel: ActivationStage[];
  surfaces: ActivationSurface[];
};
