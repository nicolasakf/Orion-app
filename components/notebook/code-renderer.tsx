"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

// Dynamically import SyntaxHighlighter with no SSR
const SyntaxHighlighter = dynamic(() => import("react-syntax-highlighter").then((mod) => mod.Prism), {
  ssr: false,
  loading: () => <Skeleton className="h-40 w-full" />,
})

// Dynamically import the style
const useSyntaxHighlighterStyle = () => {
  const [style, setStyle] = useState<any>(null)

  useEffect(() => {
    import("react-syntax-highlighter/dist/cjs/styles/prism").then((mod) => setStyle(mod.vscDarkPlus))
  }, [])

  return style
}

interface CodeRendererProps {
  source: string
  language?: string
}

export function CodeRenderer({ source, language = "python" }: CodeRendererProps) {
  const style = useSyntaxHighlighterStyle()

  if (!style) {
    return <Skeleton className="h-40 w-full" />
  }

  return (
    <div className="text-sm font-mono overflow-auto">
      <SyntaxHighlighter language={language} style={style} customStyle={{ margin: 0, borderRadius: "0.25rem" }}>
        {source}
      </SyntaxHighlighter>
    </div>
  )
}

