pipeline {
  agent any

  environment {
    PNPM_VERSION = '11.8.0'
    NODE_VERSION = '24.13.0'
    NODE_HOME = "${WORKSPACE}/.jenkins-node"
    PATH = "${WORKSPACE}/.jenkins-node/bin:${env.PATH}"
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
          set -eux
          if ! command -v node >/dev/null 2>&1 || ! node --version | grep -q '^v24'; then
            ARCH="$(uname -m)"
            case "$ARCH" in
              x86_64) NODE_ARCH=linux-x64 ;;
              aarch64|arm64) NODE_ARCH=linux-arm64 ;;
              *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
            esac
            mkdir -p "$NODE_HOME"
            curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_ARCH}.tar.gz" \
              | tar -xzf - --strip-components=1 -C "$NODE_HOME"
          fi
          node --version
          npm --version
          npm install -g "pnpm@${PNPM_VERSION}"
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
        stage('Coverage') {
          steps {
            sh 'pnpm run build:packages'
            sh 'pnpm run test:coverage'
          }
        }
      }
    }

    stage('SonarQube analysis') {
      steps {
        withSonarQubeEnv('SonarQube') {
          sh 'pnpm --package=@sonar/scan dlx sonar-scanner'
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
