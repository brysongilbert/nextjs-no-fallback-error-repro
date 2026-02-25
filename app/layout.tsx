export default function RootLayout({
  children,
}: {
  children: React.ReactNode; // eslint-disable-line no-undef
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
