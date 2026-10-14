export const icones = {
  "fleche-gauche": "M19 12H5M11 6l-6 6 6 6",
  "fleche-droite": "M5 12h14M13 6l6 6-6 6",
  "chevron-bas": "M6 9l6 6 6-6",
  "chevron-droit": "M9 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  coche: "M5 12.5l5 5L19 7",
  fermer: "M6 6l12 12M18 6L6 18",
  calendrier: "M5 7h14v13H5zM5 11h14M9 4v4M15 4v4",
  profil: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20c0-3.3 3.1-6 7-6s7 2.7 7 6",
  carte: "M3 6h18v12H3zM3 10h18M6 15h4",
  cadenas: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c-2.5 3-2.5 15 0 18M12 3c2.5 3 2.5 15 0 18",
  cloche: "M6 17h12l-1.5-2v-5a4.5 4.5 0 0 0-9 0v5zM10 20h4",
  sortie: "M10 4H5v16h5M14 8l4 4-4 4M18 12H9",
  corbeille: "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13",
  ticket: "M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8v.5",
  crayon: "M5 19v-3.5L15.5 5 19 8.5 8.5 19zM13.5 7l3.5 3.5",
  reglages: "M4 7h16M4 17h16M9 4v6M15 14v6",
} as const;   


export type NomIcone = keyof typeof icones;