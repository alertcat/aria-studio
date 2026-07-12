import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SoloCorp OS — 1 human × N agents = a company',
  description:
    'The operating system for one-person companies: agents draft, an AI jury ranks via pairwise duels + Bradley-Terry, the human CEO approves. Built at BUIDL_OPC_Hackathon_SG 2026.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
