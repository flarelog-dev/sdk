import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'FlareLog SDK',
  description: 'Zero-dependency observability SDK. Ships logs, errors, and W3C traces from any JavaScript runtime to FlareLog or any OTLP backend.',
  base: '/sdk/',
  cleanUrls: true,
  lastUpdated: true,
  
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap' }],
    ['meta', { name: 'theme-color', content: '#18181b' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en' }],
    ['meta', { property: 'og:title', content: 'FlareLog SDK Documentation' }],
    ['meta', { property: 'og:description', content: 'Zero-dependency observability for Cloudflare Workers, Vercel, Node.js, and the browser.' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Quick Start', link: '/quick-start' },
      { text: 'Guides', link: '/guides/browser-guide' },
      { text: 'Platforms', link: '/platforms/cloudflare-workers' },
      { text: 'Frameworks', link: '/frameworks/next' },
      { 
        text: 'v2.3.1',
        items: [
          { text: 'Changelog', link: 'https://github.com/flarelog-dev/sdk/releases' },
          { text: 'npm', link: 'https://www.npmjs.com/package/@flarelog/sdk' },
        ]
      },
    ],

    sidebar: {
      '/quick-start': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Quick Start', link: '/quick-start' },
          ]
        }
      ],
      '/guides/': [
        {
          text: 'Guides',
          items: [
            { text: 'Browser Guide', link: '/guides/browser-guide' },
            { text: 'Node.js Guide', link: '/guides/nodejs-guide' },
            { text: 'Advanced Features', link: '/guides/advanced-features' },
          ]
        }
      ],
      '/platforms/': [
        {
          text: 'Platforms',
          items: [
            { text: 'Cloudflare Workers', link: '/platforms/cloudflare-workers' },
            { text: 'Vercel', link: '/platforms/vercel' },
          ]
        }
      ],
      '/frameworks/': [
        {
          text: 'Frameworks',
          items: [
            { text: 'Next.js', link: '/frameworks/next' },
            { text: 'TanStack Start', link: '/frameworks/tanstack-start' },
          ]
        }
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/flarelog-dev/sdk' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright (c) 2026 Chiheb Nabil / Remote Skills LTD',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/flarelog-dev/sdk/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    outline: {
      level: 'deep',
      label: 'On this page',
    },
  },

  markdown: {
    lineNumbers: true,
  },

  vite: {
    build: {
      target: 'esnext'
    }
  },

  outDir: '../dist-docs',
  ignoreDeadLinks: true,
})