import { CloudOpenClient } from "./cloud-open-client";

interface CloudOpenPageProps {
  searchParams: Promise<{
    slug?: string | string[];
    apiBaseUrl?: string | string[];
  }>;
}

/** Local Orion handoff endpoint for hosted published notebooks. */
export default async function CloudOpenPage({ searchParams }: CloudOpenPageProps) {
  const params = await searchParams;
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const apiBaseUrl = Array.isArray(params.apiBaseUrl)
    ? params.apiBaseUrl[0]
    : params.apiBaseUrl;

  return <CloudOpenClient slug={slug ?? ""} apiBaseUrl={apiBaseUrl ?? ""} />;
}
