import type { ProjectDto } from "@/lib/client/api";
import type { AdContent } from "./types";

/** Starting ad text for a product (name, price and a CTA in the chosen language). */
export function defaultContent(project?: ProjectDto | null, arabic?: boolean): AdContent {
  const name = project?.product.name || project?.analysis?.productName || project?.name || "";
  const price = project?.product.price ? `${project.product.price}${project.product.currency ? ` ${project.product.currency}` : ""}` : "";
  return arabic
    ? { headline: name || "تشكيلة جديدة", subheadline: "", cta: "تسوق الآن", price }
    : { headline: name || "New collection", subheadline: "", cta: "Shop now", price };
}
