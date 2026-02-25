export const dynamicParams = false;

export function generateStaticParams() {
  return [{ slug: 'about' }, { slug: 'contact' }];
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <h1>{slug}</h1>;
}
