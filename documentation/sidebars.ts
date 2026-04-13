import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  publicDocs: [
    'index',
    {
      type: 'category',
      label: 'Install Tarnished',
      link: {type: 'doc', id: 'install/index'},
      items: [
        'install/docker-compose',
        'install/postgresql-docker-compose',
        'install/helm',
      ],
    },
    {
      type: 'category',
      label: 'Get started in Tarnished',
      link: {type: 'doc', id: 'get-started/index'},
      items: [
        'get-started/create-admin-account',
        'get-started/create-your-first-application',
        'get-started/create-your-first-api-key',
      ],
    },
    {
      type: 'category',
      label: 'How-to',
      link: {type: 'doc', id: 'how-to/index'},
      items: [
        'how-to/configure-api-keys',
        'how-to/configure-ai-settings',
        'how-to/import-and-export-data',
        'how-to/backup-and-restore-tarnished',
        'how-to/upgrade-tarnished',
        'how-to/use-the-cli',
        'how-to/use-the-browser-extension',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      link: {type: 'doc', id: 'reference/index'},
      items: [
        'reference/environment-variables',
        'reference/api-overview',
        'reference/helm-chart-reference',
      ],
    },
    {
      type: 'category',
      label: 'Explanation',
      link: {type: 'doc', id: 'explanation/index'},
      items: [
        'explanation/architecture-overview',
        'explanation/storage-and-backups',
        'explanation/auth-and-api-keys',
        'explanation/transfer-jobs',
      ],
    },
    {
      type: 'category',
      label: 'Troubleshooting',
      link: {type: 'doc', id: 'troubleshooting/index'},
      items: ['troubleshooting/deployment-and-startup'],
    },
  ],

  contributingDocs: [
    'contributing/index',
    'contributing/docs-architecture',
    'contributing/docs-style-guide',
    'contributing/docs-roadmap',
    {
      type: 'category',
      label: 'Templates',
      items: [
        'contributing/templates/tutorial-template',
        'contributing/templates/how-to-template',
        'contributing/templates/reference-template',
        'contributing/templates/explanation-template',
        'contributing/templates/troubleshooting-template',
      ],
    },
  ],
};

export default sidebars;
