import type { GatheredSource, LinkedPage } from "@/lib/types";
import { readXThread } from "@/lib/bird";
import { isXStatusUrl, normalizeSourceUrl } from "@/lib/url";
import { readWebPage } from "@/lib/web";

async function readLinkedPages(urls: string[]): Promise<LinkedPage[]> {
  const settled = await Promise.allSettled(
    [...new Set(urls)].slice(0, 4).map(async (url) => {
      const page = await readWebPage(url);
      return { url: page.url, title: page.title, text: page.text };
    }),
  );

  return settled.flatMap((item) => (item.status === "fulfilled" ? [item.value] : []));
}

export async function gatherSource(value: string): Promise<GatheredSource> {
  const sourceUrl = normalizeSourceUrl(value);

  if (isXStatusUrl(sourceUrl)) {
    const thread = await readXThread(sourceUrl);
    return {
      sourceType: "x",
      sourceUrl,
      title: thread.title,
      authorContent: thread.authorContent,
      communityContent: thread.communityContent,
      linkedPages: await readLinkedPages(thread.authorLinks),
    };
  }

  const page = await readWebPage(sourceUrl);
  return {
    sourceType: "web",
    sourceUrl: page.url,
    title: page.title,
    authorContent: [{ text: page.text, url: page.url }],
    communityContent: [],
    linkedPages: [],
  };
}
