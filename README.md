# Kamal SSM Deploy

AWS EC2에 [Kamal](https://kamal-deploy.org/)로 Rails 앱을 배포하되, SSH 접속을 [AWS SSM](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)으로 대체하는 레퍼런스 프로젝트.

EC2에 외부에서 접근 가능한 포트를 하나도 열지 않고, Security Group은 CloudFront origin-facing prefix list의 443 인바운드만 허용한다. 이 구성만으로도 VPS(DigitalOcean 등) 수준의 단일 서버 배포 환경을 만들 수 있다.

> 이 레포지토리는 블로그 포스팅의 레퍼런스입니다. CloudFront 배포는 포함하지 않습니다.

## Architecture

```
┌─────────────────────────────────────────────────┐
│ AWS                                             │
│                                                 │
│  ┌───────────┐    443    ┌───────────────────┐  │
│  │CloudFront │──────────▶│   EC2 (arm64)     │  │
│  │(not in    │  CF only  │                   │  │
│  │ this repo)│           │  kamal-proxy :80  │  │
│  └───────────┘           │  Rails app        │  │
│                          │  SQLite           │  │
│                          └─────────┬─────────┘  │
│                                    │             │
│                          SSM Session Manager     │
│                          (no open SSH port)      │
│                                    │             │
└────────────────────────────────────┼─────────────┘
                                     │
                              ┌──────┴──────┐
                              │  Developer  │
                              │  laptop     │
                              └─────────────┘
```

### CDK Stacks

```
Stage (Dev / Prod)
├── PersistentStack — VPC (default VPC 또는 신규 생성)
└── ApplicationStack — EC2 instance (PublicInstance construct)
```

**PublicInstance construct:**

- Ubuntu 24.04 (Noble), arm64, t4g.medium
- Security Group: CloudFront prefix list (`com.amazonaws.global.cloudfront.origin-facing`) 443 인바운드만 허용
- IMDSv2 강제 (`HttpTokens: REQUIRED`)
- SSM Session Manager 접속용 IAM role (`AmazonSSMManagedInstanceCore`)

## Why SSM?

일반적으로 EC2에 배포하려면 SSH 22번 포트를 열어야 한다. 이는 곧 퍼블릭 IP를 통한 공격 표면이 된다.

SSM Session Manager를 사용하면:

- **SSH 포트를 열 필요가 없다.** Security Group에 22번 인바운드 규칙이 없어도 된다.
- **SSH 키 관리가 불필요하다.** IAM 인증으로 접속한다.
- **Kamal과 호환된다.** `proxy_command`를 설정하면 Kamal이 SSM 터널을 통해 SSH 세션을 맺는다.

결과적으로 EC2의 Security Group은 CloudFront에서 오는 HTTPS 트래픽만 허용하면 되고, 나머지 모든 관리 접속은 SSM을 통한다.

## Why CloudFront prefix list only?

Security Group에서 `0.0.0.0/0`이 아닌 CloudFront origin-facing prefix list만 허용하는 이유:

- EC2의 퍼블릭 IP를 직접 알아내더라도, CloudFront를 경유하지 않는 요청은 Security Group에서 차단된다.
- CloudFront의 WAF, DDoS 보호, 지리적 제한 등의 보호 기능을 우회할 수 없게 된다.
- EC2는 사실상 CloudFront 뒤에 숨은 origin 서버가 된다.

## CD (GitHub Actions)

main 브랜치에 push되면 자동 배포된다 (수동 트리거도 가능):

1. OIDC로 AWS 인증 (`role-to-assume`)
2. SSM Session Manager 플러그인 설치
3. 임시 SSH 키페어 생성
4. GHCR(GitHub Container Registry)에 이미지 push 후 `bin/kamal deploy` 실행
5. 배포 후 SSH 키 삭제

배포에 필요한 GitHub 설정:

| 구분 | 이름 | 설명 |
|------|------|------|
| Secret | `AWS_ROLE_ARN` | OIDC용 IAM Role ARN |
| Secret | `RAILS_MASTER_KEY` | Rails master key |
| Variable | `AWS_REGION` | AWS 리전 |
| Variable | `INSTANCE_ID` | EC2 인스턴스 ID |

> 배포 워크플로우는 concurrency group으로 동시 배포를 방지한다.

## Prerequisites

- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [AWS SSM Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)
- [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting-started.html)
- [Docker](https://www.docker.com/)
- [Ruby](https://www.ruby-lang.org/)
- SSH key pair (`~/.ssh/id_ed25519`)

## Setup

### 1. Provision infrastructure

```sh
cd infra
npm install
npx cdk deploy 'Dev/*'
```

배포가 완료되면 `InstanceId`가 출력된다.

### 2. Configure Instance ID

Instance ID를 환경 변수로 설정한다:

```sh
export INSTANCE_ID=i-0xxxxxxxxxxxx
```

`config/deploy.yml`은 ERB로 `ENV.fetch("INSTANCE_ID")`를 사용하므로, 환경 변수만 설정하면 된다.

### 3. Configure registry credentials

로컬 배포 시에는 기본값으로 local registry(`localhost:5555`)를 사용한다. GHCR 등 외부 registry를 사용하려면:

```sh
export KAMAL_REGISTRY_SERVER=ghcr.io
export KAMAL_REGISTRY_USERNAME=your-username
export KAMAL_REGISTRY_PASSWORD=your-token
```

### 4. Deploy with Kamal

```sh
kamal server bootstrap    # 호스트에 Docker 설치
kamal deploy   # 이후 배포
```

### 5. Verify

SSM 포트 포워딩으로 앱이 동작하는지 확인한다:

```sh
aws ssm start-session \
  --target <instance-id> \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["80"],"localPortNumber":["8080"]}'
```

http://localhost:8080/up 으로 health check 응답을 확인한다.

## Deploy config structure

`config/deploy.yml`은 ERB 템플릿으로 환경 변수를 동적으로 참조한다:

- **Instance ID** — `ENV.fetch("INSTANCE_ID")`로 배포 대상 서버를 결정
- **Registry** — `ENV.fetch("KAMAL_REGISTRY_SERVER", "localhost:5555")`로 로컬/외부 registry 전환
- **Builder cache** — registry 기반 Docker 레이어 캐시 (`type: registry`, `mode=max`)로 빌드 속도 최적화
- **Secrets** — `.kamal/secrets`에서 `RAILS_MASTER_KEY`는 `config/master.key` 파일을 우선 읽고, 없으면 환경 변수로 fallback

로컬 개발과 CI/CD에서 동일한 `deploy.yml`을 공유하며, 환경 변수만으로 동작을 전환한다.

## How Kamal connects via SSM

`config/deploy.yml`의 SSH 설정:

```yaml
ssh:
  user: ubuntu
  proxy_command: >-
    aws ec2-instance-connect send-ssh-public-key
      --instance-id %h
      --instance-os-user ubuntu
      --ssh-public-key file://~/.ssh/id_ed25519.pub > /dev/null &
    aws ssm start-session
      --target %h
      --document-name AWS-StartSSHSession
      --parameters 'portNumber=22'
```

이 `proxy_command`는 두 가지 일을 한다:

1. **`ec2-instance-connect send-ssh-public-key`** — 로컬의 공개키를 EC2 인스턴스 메타데이터에 60초간 등록한다.
2. **`aws ssm start-session`** — SSM 터널을 통해 SSH 포트(22)로 연결한다.

Kamal은 이 터널을 통해 일반 SSH처럼 Docker 명령어를 실행한다.

## Kamal hooks

### docker-setup

Kamal이 Docker를 설치한 직후 실행되는 hook. `ubuntu` 사용자를 `docker` 그룹에 추가한다.

`$KAMAL_HOSTS` 환경 변수에서 인스턴스 ID를 추출한 후, SSM `SendCommand`로 원격 명령을 실행한다.

## Teardown

```sh
cd infra
npx cdk destroy 'Dev/*'
```

## Note

- **CloudFront 미포함**: 이 레포지토리는 레퍼런스 목적이므로 CloudFront 배포를 포함하지 않는다. 프로덕션에서는 CloudFront를 앞에 두어야 443 인바운드 규칙이 의미를 가진다.
- **Registry 전환 가능**: 로컬 개발 시에는 기본값인 local registry(`localhost:5555`)를 사용하고, CI/CD에서는 환경 변수로 GHCR 등 외부 registry로 전환한다.
