import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'FlareLog SDK',
  description: 'Zero-dependency observability SDK. Ship logs, errors, and traces from any JavaScript runtime to FlareLog or any OTLP backend.',
  base: '/',
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
      { text: 'Getting Started', link: '/getting-started/installation' },
      { text: 'Core API', link: '/core-api/' },
      { text: 'Guides', link: '/guides/browser' },
      { text: 'Platforms', link: '/platforms/cloudflare-workers' },
      { text: 'Frameworks', link: '/frameworks/nextjs' },
      { text: 'OTel Integration', link: '/otel-integration/overview' },
      { 
        text: 'v2.3.1',
        items: [
          { text: 'Changelog', link: 'https://github.com/flarelog-dev/sdk/releases' },
          { text: 'npm', link: 'https://www.npmjs.com/package/@flarelog/sdk' },
        ]
      },
    ],

    sidebar: {
      '/getting-started/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Installation', link: '/getting-started/installation' },
            { text: 'Choosing Integration', link: '/getting-started/choosing-integration' },
          ]
        }
      ],
      '/core-api/': [
        {
          text: 'Core API',
          items: [
            { text: 'Overview', link: '/core-api/' },
            { text: 'FlareLog Class', link: '/core-api/flarelog-class' },
            { text: 'FlareLogChild Class', link: '/core-api/flarelog-child' },
            { text: 'Configuration', link: '/core-api/configuration' },
            { text: 'Logging Methods', link: '/core-api/logging-methods' },
            { text: 'Error Handling', link: '/core-api/error-handling' },
            { text: 'Transports', link: '/core-api/transports' },
          ]
        }
      ],
      '/guides/': [
        {
          text: 'Guides',
          items: [
            { text: 'Browser', link: '/guides/browser' },
            { text: 'Node.js', link: '/guides/nodejs' },
            { text: 'Advanced Features', link: '/guides/advanced' },
          ]
        }
      ],
      '/platforms/': [
        {
          text: 'Platforms',
          items: [
            { text: 'Cloudflare Workers', link: '/platforms/cloudflare-workers' },
            { text: 'Vercel', link: '/platforms/vercel' },
            { text: 'Lovable', link: '/platforms/lovable' },
          ]
        }
      ],
      '/frameworks/': [
        {
          text: 'Frameworks',
          items: [
            { text: 'Next.js', link: '/frameworks/nextjs' },
            { text: 'TanStack Start', link: '/frameworks/tanstack-start' },
          ]
        }
      ],
      '/otel-integration/': [
        {
          text: 'OTel Integration',
          items: [
            { text: 'Overview', link: '/otel-integration/overview' },
            { text: 'Trace Propagation', link: '/otel-integration/trace-propagation' },
            { text: 'Fan-out', link: '/otel-integration/fan-out' },
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
