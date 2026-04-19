import localFont from "next/font/local";
import { Suspense } from 'react';
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata = {
  title: "Poonawalla Fincorp | AI-Powered Loan Onboarding",
  description: "Get a personal loan in 90 seconds. No paperwork, no branch visit. Just a 2-minute AI conversation. RBI Compliant.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0A0F1E',color:'#F9FAFB'}}>Loading...</div>}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}
