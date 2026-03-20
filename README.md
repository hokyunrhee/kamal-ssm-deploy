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

### 2. Configure deploy.yml

출력된 Instance ID를 `config/deploy.yml`에 설정한다:

```yaml
x-instance-id: &instance-id i-0xxxxxxxxxxxx
```

### 3. Deploy with Kamal

```sh
kamal server bootstrap    # 호스트에 Docker 설치
kamal deploy   # 이후 배포
```

### 4. Verify

SSM 포트 포워딩으로 앱이 동작하는지 확인한다:

```sh
aws ssm start-session \
  --target <instance-id> \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["80"],"localPortNumber":["8080"]}'
```

http://localhost:8080/up 으로 health check 응답을 확인한다.

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

SSM `SendCommand`로 원격 명령을 실행하는 방식을 사용한다. (`deploy.yml`의 YAML alias를 파싱하기 위해 `aliases: true` 옵션이 필요하다.)

## Teardown

```sh
cd infra
npx cdk destroy 'Dev/*'
```

## Note

- **CloudFront 미포함**: 이 레포지토리는 레퍼런스 목적이므로 CloudFront 배포를 포함하지 않는다. 프로덕션에서는 CloudFront를 앞에 두어야 443 인바운드 규칙이 의미를 가진다.
- **Local registry 사용**: 이 프로젝트는 Kamal의 local registry(`localhost:5555`)를 사용한다. 프로덕션에서는 ECR, GHCR, Docker Hub 등 외부 registry를 고려할 수 있다.
