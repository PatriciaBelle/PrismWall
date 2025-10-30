import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>GraffitiChain - 数字涂鸦上链</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
