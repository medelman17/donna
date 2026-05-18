-- CreateTable
CREATE TABLE "Candidate" (
    "login" TEXT NOT NULL PRIMARY KEY,
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
    "githubCreatedAt" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ForkMeta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateLogin" TEXT NOT NULL,
    "forkHtmlUrl" TEXT,
    "forkPushedAt" DATETIME,
    "forkStars" INTEGER NOT NULL DEFAULT 0,
    "aheadBy" INTEGER NOT NULL DEFAULT 0,
    "behindBy" INTEGER NOT NULL DEFAULT 0,
    "hasOwnCommits" BOOLEAN NOT NULL DEFAULT false,
    "defaultBranch" TEXT,
    CONSTRAINT "ForkMeta_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate" ("login") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Repo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateLogin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "htmlUrl" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "pushedAt" DATETIME,
    "isFork" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Repo_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate" ("login") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateLogin" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "repoName" TEXT,
    "createdAt" DATETIME NOT NULL,
    "payload" TEXT,
    CONSTRAINT "Event_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate" ("login") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateLogin" TEXT NOT NULL,
    "summary" TEXT,
    "seniority" TEXT,
    "fitScore" INTEGER,
    "fitReasoning" TEXT,
    "recommendedOutreach" TEXT,
    "outreachReason" TEXT,
    "confidence" REAL,
    "model" TEXT,
    "promptVersion" INTEGER NOT NULL DEFAULT 1,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawJson" TEXT,
    CONSTRAINT "Profile_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate" ("login") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateLogin" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "Signal_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate" ("login") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateLogin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Skill_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate" ("login") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Crm" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateLogin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "notes" TEXT,
    "tags" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Crm_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate" ("login") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LinkedInProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LinkedInProfile_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate" ("login") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebMention" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateLogin" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "snippet" TEXT,
    "source" TEXT NOT NULL,
    "content" TEXT,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebMention_candidateLogin_fkey" FOREIGN KEY ("candidateLogin") REFERENCES "Candidate" ("login") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ForkMeta_candidateLogin_key" ON "ForkMeta"("candidateLogin");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_candidateLogin_key" ON "Profile"("candidateLogin");

-- CreateIndex
CREATE UNIQUE INDEX "Crm_candidateLogin_key" ON "Crm"("candidateLogin");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInProfile_candidateLogin_key" ON "LinkedInProfile"("candidateLogin");
