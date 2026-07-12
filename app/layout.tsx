import type { Metadata } from 'next'
import { DM_Sans, DM_Mono } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-dm-mono',
})

export const metadata: Metadata = {
  title: 'SoloCorp OS, a one-person ad studio run by agents',
  description:
    'Agents concept, a Claude jury ranks via pairwise duels and Bradley-Terry, Seedance renders real video, and the human CEO acceptance releases escrow. Built at BUIDL_OPC_Hackathon_SG 2026.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  )
}
