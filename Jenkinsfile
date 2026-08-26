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

          # Python for node-gyp (better-sqlite3) — best-effort on locked-down agents
          if ! command -v python3 >/dev/null 2>&1; then
            if [ "$(id -u)" = "0" ] && command -v apt-get >/dev/null 2>&1; then
              export DEBIAN_FRONTEND=noninteractive
              apt-get update -qq
              apt-get install -y -qq python3 make g++ || true
            elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
              export DEBIAN_FRONTEND=noninteractive
              sudo apt-get update -qq
              sudo apt-get install -y -qq python3 make g++ || true
            else
              echo "WARN: python3 missing — native rebuild may fail"
            fi
          fi
          command -v python3 >/dev/null 2>&1 && python3 --version || true
        '''
      }
    }

    stage('Install') {
      steps {
        sh '''
          set -eux
          # ignore-scripts skips electron postinstall (binary download) — restore it explicitly
          pnpm install --frozen-lockfile --ignore-scripts
          pnpm rebuild electron
          npm rebuild better-sqlite3 || true
          node -e "require('better-sqlite3')" || echo "WARN: better-sqlite3 load failed"
          if [ -d node_modules/electron ]; then
            bash scripts/jenkins/verify-electron-runtime.sh "$PWD" || echo "WARN: Electron runtime verify failed"
          fi
        '''
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
            // Coverage must not gate Sonar analysis — warn/unstable, still archive whatever lcov exists.
            catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
              sh '''
                set -eux
                pnpm run build:packages
                pnpm run test:coverage
                test -s coverage/lcov.info && wc -l coverage/lcov.info
              '''
            }
          }
        }
        stage('Sonar pattern guards') {
          steps {
            sh 'pnpm run test:sonar-patterns'
            sh 'pnpm run check:sonar-patterns'
          }
        }
      }
    }

    stage('SonarQube analysis') {
      steps {
        withSonarQubeEnv('SonarQube') {
          // @sonar/scan v5 only ships sonar-scanner-npm (sonar-scanner alias removed → ENOENT on PATH).
          sh 'bash scripts/jenkins/run-sonar-scanner.sh'
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'coverage/lcov.info,coverage/**/lcov.info', allowEmptyArchive: true
      cleanWs()
    }
  }
}
