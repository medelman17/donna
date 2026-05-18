-- CreateTable
CREATE TABLE "Candidate" (
    "login" TEXT NOT NULL,
    "name" TEXT,
    "bio" TEXT,
    "location" TEXT,
    "company" TEXT,
    "blog" TEXT,
    "twitter" TEXT,
    "hireable" BOOLEAN,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "publicRepos" INTEGER NOT NULL DEFAULT 0,
    "avatarUrl" TEXT,
    "htmlUrl" TEXT,
    "githubCreatedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("login")
);

-- CreateTable
CREATE TABLE "ForkMeta" (
    "id" SERIAL NOT NULL,
    "candidateLogin" TEXT NOT NULL,
    "forkHtmlUrl" TEXT,
    "forkPushedAt" TIMESTAMP(3),
    "forkStars" INTEGER NOT NULL DEFAULT 0,
    "aheadBy" INTEGER NOT NULL DEFAULT 0,
    "behindBy" INTEGER NOT NULL DEFAULT 0,
    "hasOwnCommits" BOOLEAN NOT NULL DEFAULT false,
    "defaultBranch" TEXT,

    CONSTRAINT "ForkMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repo" (
    "id" SERIAL NOT NULL,
    "candidateLogin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "htmlUrl" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "pushedAt" TIMESTAMP(3),
    "isFork" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Repo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "candidateLogin" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "repoName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "payload" TEXT,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" SERIAL NOT NULL,
    "candidateLogin" TEXT NOT NULL,
    "summary" TEXT,
    "seniority" TEXT,
    "fitScore" INTEGER,
    "fitReasoning" TEXT,
    "recommendedOutreach" TEXT,
    "outreachReason" TEXT,
    "confidence" DOUBLE PRECISION,
    "model" TEXT,
    "promptVersion" INTEGER NOT NULL DEFAULT 1,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawJson" TEXT,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" SERIAL NOT NULL,
    "candidateLogin" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" SERIAL NOT NULL,
    "candidateLogin" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Crm" (
    "id" SERIAL NOT NULL,
    "candidateLogin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "notes" TEXT,
    "tags" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Crm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedInProfile" (
    "id" SERIAL NOT NULL,
    "candidateLogin" TEXT NOT NULL,
    "profileUrl" TEXT,
    "headline" TEXT,
    "currentTitle" TEXT,
    "currentCompany" TEXT,
    "location" TEXT,
    "connectionCount" INTEGER,
    "experience" TEXT,
    "education" TEXT,
    "skills" TEXT,
    "certifications" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedInProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebMention" (
    "id" SERIAL NOT NULL,
    "candidateLogin" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "snippet" TEXT,
    "source" TEXT NOT NULL,
    "content" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichmentLog" (
    "id" SERIAL NOT NULL,
    "candidateLogin" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrichmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "candidateLogin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForkMeta_candidateLogin_key" ON "ForkMeta"("candidateLogin");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_candidateLogin_key" ON "Profile"("candidateLogin");

-- CreateIndex
CREATE UNIQUE INDEX "Crm_candidateLogin_key" ON "Crm"("candidateLogin");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInProfile_candidateLogin_key" ON "LinkedInProfile"("candidateLogin");

-- CreateIndex
CREATE INDEX "EnrichmentLog_candidateLogin_idx" ON "EnrichmentLog"("candidateLogin");

-- CreateIndex
CREATE INDEX "EnrichmentLog_tool_idx" ON "EnrichmentLog"("tool");

-- CreateIndex
CREATE INDEX "EnrichmentLog_createdAt_idx" ON "EnrichmentLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMemory_key_key" ON "AgentMemory"("key");

-- CreateIndex
CREATE INDEX "AgentMemory_candidateLogin_idx" ON "AgentMemory"("candidateLogin");

-- AddForeignKey
ALTER TABLE "ForkMeta" ADD CONSTRAINT "ForkMeta_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate"("login") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repo" ADD CONSTRAINT "Repo_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate"("login") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate"("login") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate"("login") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate"("login") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate"("login") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crm" ADD CONSTRAINT "Crm_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate"("login") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInProfile" ADD CONSTRAINT "LinkedInProfile_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate"("login") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebMention" ADD CONSTRAINT "WebMention_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate"("login") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentLog" ADD CONSTRAINT "EnrichmentLog_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate"("login") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate"("login") ON DELETE SET NULL ON UPDATE CASCADE;
