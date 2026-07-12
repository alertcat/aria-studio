import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'SoloCorp Studio, a one-person media company run by agents',
  description:
    'Agents concept, a Claude jury ranks concepts through pairwise duels and Bradley-Terry, Seedance renders real footage, gpt-image-2 ships the key visual, and the human CEO greenlights spend and releases escrow. Built at BUIDL_OPC_Hackathon_SG 2026.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  )
}
