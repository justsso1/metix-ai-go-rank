import { ROUTES } from "./site.ts";

export type ShareMetadata = {
  title: string;
  description: string;
  path: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
  imageAlt: string;
};

export function shareMetadata(): ShareMetadata {
  return {
    title: "Every recruiter search creates a ranking. Now you can see yours.",
    description:
      "Paste your LinkedIn URL. See how you rank when recruiters search your role and city.",
    path: ROUTES.entry,
    image: "/recruiters-view/og/default.jpg",
    imageWidth: 1200,
    imageHeight: 630,
    imageAlt:
      "Recruiter's View by Metix AI. See where you rank in a recruiter search.",
  };
}
