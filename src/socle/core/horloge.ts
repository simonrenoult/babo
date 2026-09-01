/**
 * Le temps est un port : les échéances de 018 et l'ancienneté des sources de
 * 019 se testent en avançant l'horloge, pas en attendant.
 */
export type Horloge = {
  maintenant(): Date;
};

export const horlogeSysteme: Horloge = {
  maintenant: () => new Date(),
};
