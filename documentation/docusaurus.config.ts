import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import gruvboxTarnishedDark from './src/prism/gruvboxTarnishedDark';

const config: Config = {
  title: 'Tarnished Documentation',
  tagline: 'Documentation for Tarnished, a self-hosted job application tracker.',
  favicon: 'img/favicon.png',
  future: {
    v4: true,
  },
  url: 'https://markoonakic.github.io',
  baseUrl: '/tarnished/',
  organizationName: 'markoonakic',
  projectName: 'tarnished',
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  presets: [
    [
      'classic',
      {
        docs: {
          path: 'content',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/markoonakic/tarnished/edit/main/documentation/',
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },
    navbar: {
      title: 'Tarnished',
      items: [
        {
          type: 'doc',
          docId: 'install/index',
          position: 'left',
          label: 'Install',
        },
        {
          href: 'https://github.com/markoonakic/tarnished',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Home',
              to: '/',
            },
            {
              label: 'Install Tarnished',
              to: '/install',
            },
            {
              label: 'Get started in Tarnished',
              to: '/get-started',
            },
          ],
        },
        {
          title: 'Project',
          items: [
            {
              label: 'Repository',
              href: 'https://github.com/markoonakic/tarnished',
            },
            {
              label: 'Releases',
              href: 'https://github.com/markoonakic/tarnished/releases',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Tarnished. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.gruvboxMaterialLight,
      darkTheme: gruvboxTarnishedDark,
      additionalLanguages: ['bash', 'json', 'yaml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
