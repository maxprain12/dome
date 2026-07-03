pipeline {
  agent any

  environment {
    PNPM_VERSION = '11.8.0'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Setup') {
      steps {
        sh '''
          corepack enable
          corepack prepare pnpm@${PNPM_VERSION} --activate
          node --version
          pnpm --version
        '''
      }
    }

    stage('Install') {
      steps {
        sh 'pnpm install --frozen-lockfile --ignore-scripts'
      }
    }

    stage('Quality checks') {
      parallel {
        stage('Typecheck') {
          steps { sh 'pnpm run typecheck' }
        }
        stage('Lint') {
          steps { sh 'pnpm run lint' }
        }
        stage('Security tests') {
          steps { sh 'pnpm run test:security' }
        }
      }
    }

    stage('SonarQube analysis') {
      steps {
        withSonarQubeEnv('SonarQube') {
          sh 'pnpm dlx @sonar/scan'
        }
      }
    }
  }

  post {
    always {
      cleanWs()
    }
  }
}
