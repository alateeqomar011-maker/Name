import { z } from "zod";

// Output schemas for every Claude-powered tool. Shared by server (structured
// outputs + validation) and client (typed rendering).

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "ar", label: "العربية (Arabic)" },
] as const;
export type Language = (typeof LANGUAGES)[number]["id"];

export const TONES = [
  { id: "professional", label: "Professional" },
  { id: "luxury", label: "Luxury" },
  { id: "friendly", label: "Friendly" },
  { id: "persuasive", label: "Persuasive" },
  { id: "minimal", label: "Minimal" },
  { id: "playful", label: "Playful" },
] as const;
export type Tone = (typeof TONES)[number]["id"];

export const analysisSchema = z.object({
  productName: z.string().describe("Short generic name of the product as seen, e.g. 'Amber glass serum dropper bottle'"),
  category: z.string(),
  visibleBrandText: z.array(z.string()).describe("Text exactly as printed on the product or label; empty if none is legible"),
  colors: z.array(z.object({ name: z.string(), hex: z.string() })),
  materials: z.array(z.string()).describe("Apparent materials, each prefixed with 'appears to be' when not certain"),
  shape: z.string(),
  suggestedLayout: z.enum(["standing", "floating", "flatlay"]),
  suggestedStyles: z.array(z.string()),
  visibleAttributes: z.array(z.string()).describe("Only observable features: finish, closures, shape details, label layout"),
  photoIssues: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
});
export type Analysis = z.infer<typeof analysisSchema>;

export const descriptionSchema = z.object({
  titles: z.array(z.string()).describe("Three alternative product titles"),
  shortDescription: z.string(),
  description: z.string().describe("Full description; separate paragraphs with a blank line"),
  features: z.array(z.string()).describe("Feature bullets grounded only in the provided facts or visible attributes"),
  benefits: z.array(z.string()),
  specifications: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .describe("ONLY specifications explicitly provided by the seller or printed on the product; empty if none"),
  seo: z.object({
    metaTitle: z.string(),
    metaDescription: z.string(),
    keywords: z.array(z.string()),
    urlSlug: z.string(),
  }),
  missingInfo: z.array(z.string()).describe("Details the seller should add to make the listing stronger"),
});
export type DescriptionOutput = z.infer<typeof descriptionSchema>;

export const socialSchema = z.object({
  posts: z.array(
    z.object({
      platform: z.string(),
      format: z.string(),
      hook: z.string(),
      caption: z.string(),
      hashtags: z.array(z.string()),
      cta: z.string(),
      visualHeadline: z.string().describe("Text for the image overlay, at most 6 words"),
      tip: z.string().describe("One practical posting tip for this platform"),
    }),
  ),
  extraHooks: z.array(z.string()),
  campaignIdeas: z.array(z.object({ title: z.string(), concept: z.string(), formats: z.array(z.string()) })),
});
export type SocialOutput = z.infer<typeof socialSchema>;

export const adCopySchema = z.object({
  variants: z.array(
    z.object({
      headline: z.string().describe("At most 6 words"),
      subheadline: z.string().describe("At most 14 words"),
      cta: z.string().describe("At most 3 words"),
      badge: z.string().describe("Short badge text such as '-30%' or 'NEW'; empty string if none"),
      tagline: z.string(),
    }),
  ),
});
export type AdCopyOutput = z.infer<typeof adCopySchema>;

export const brandKitSchema = z.object({
  palette: z.array(
    z.object({
      name: z.string(),
      hex: z.string(),
      role: z.enum(["primary", "secondary", "accent", "neutral", "background"]),
    }),
  ),
  typography: z.object({ heading: z.string(), body: z.string(), rationale: z.string() }),
  voice: z.object({
    personality: z.array(z.string()),
    tone: z.string(),
    do: z.array(z.string()),
    dont: z.array(z.string()),
  }),
  taglines: z.array(z.string()),
  elevatorPitch: z.string(),
  socialBio: z.string(),
  hashtags: z.array(z.string()),
  logoDirection: z.string().describe("A written direction for a designer; Vitrine does not generate logos"),
});
export type BrandKitOutput = z.infer<typeof brandKitSchema>;

export const campaignSchema = z.object({
  name: z.string(),
  bigIdea: z.string(),
  tagline: z.string(),
  keyMessages: z.array(z.string()),
  audience: z.string(),
  palette: z.array(z.string()).describe("3-4 hex colors for the campaign visuals"),
  schedule: z.array(
    z.object({
      day: z.number().int(),
      platform: z.string(),
      format: z.string(),
      title: z.string(),
      hook: z.string(),
      caption: z.string(),
      hashtags: z.array(z.string()),
      visualHeadline: z.string().describe("At most 6 words"),
      cta: z.string(),
    }),
  ),
  emailSubjectLines: z.array(z.string()),
  kpis: z.array(z.string()),
});
export type CampaignOutput = z.infer<typeof campaignSchema>;
