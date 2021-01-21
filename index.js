const Git = require('nodegit')
const { BehaviorSubject, Subject, combineLatest } = require('rxjs')
const path = require('path')
const fs = require('fs')
var pathToRepo = path.resolve("./tempgit");


class GitService {
  Git = Git
  projectPath = pathToRepo // 本地模拟
  $taskId = new Subject()
  // $commits = new BehaviorSubject([]) // 当前项目的所有commit
  $relevantCommits = new BehaviorSubject([]) // 与当前任务块相关的commit
  log = console

  constructor() {
    this._generateRelevantCommits()
  }

  async _generateRelevantCommits() {
    this.$taskId.subscribe(taskId => {
      const relevantCommits = this._getRelevantCommits(taskId)
      this.$relevantCommits.next(relevantCommits)
    })
  }

  async _getRelevantCommits(fileName) {
    const repository = await this.getRepository(this.projectPath)
    const commit = await repository.getMasterCommit()
    const revwalk = repository.createRevWalk()

    revwalk.push(commit.sha())
    revwalk.sorting(this.Git.Revwalk.SORT.TIME)

    const historyEntrys = await revwalk.fileHistoryWalk(fileName, 100)
    const relevantCommits = historyEntrys.map(historyEntry => historyEntry.commit)

    return relevantCommits
  }

  /**
   * 保存时间线
   * @param {string} fileName
   */
  async saveTimeLine(fileName, message) {
    // todo 复制任务块到tempgit文件夹
    const treeOid = await this._add(fileName)
    if (!treeOid) return this.log.error('保存失败1')
    const commitOid = await this._createCommit(treeOid, message)
    if (!commitOid) return this.log.error('保存失败2')
  }

  /**
   * 恢复时间线
   * @param {string} fileName 
   * @param {string} commitOid 
   */
  async recoverTimeLine(fileName, commitOid) {
    const repository = await this.getRepository(this.projectPath)
    const commit = await repository.getCommit(commitOid)
    const treeOid = await commit.treeId()
    const tree = await repository.getTree(treeOid)
    const index = await repository.index()

    // 更改磁盘信息
    await index.readTree(tree)
    await index.write()

    // 更改文件内容
    const treeEntry = await tree.getEntry(fileName)
    const blob = await treeEntry.getBlob()
    const content = blob.toString()
    const realPath = path.join(__dirname, `./tempgit/${fileName}`)
    await fs.writeFileSync(realPath, content)

    // 创建commit
    const message = commit.message().replace(/&.*/, '')
    const headCommitOid = await this._createCommit(treeOid, `${message}&${commit.timeMs()}`)

    return headCommitOid
  }

  /**
   * 目标版本与当前版本的不同
   * @param {string} targetCommitOid 
   */
  async targetToCurrent(targetCommitOid) {
    const repository = await this.getRepository(this.projectPath)
    const headCommit = await repository.getHeadCommit()
    const targetCommit = await repository.getCommit(targetCommitOid)
    const diff = await this.getDiff(targetCommit, headCommit)

    const result = {}
    for (const patch of await diff.patches()) {
      const filePath = patch.oldFile().path()
      result[filePath] = []
      for (const hunk of await patch.hunks())
        for (const line of await hunk.lines()) {
          result[filePath].push({
            status: String.fromCharCode(line.origin()).trim(),
            content: line.content().replace(/\n/, '')
          })
        }

    }

    return result
  }

  async initDir(dirPath) {
    const repository = await this.Git.Repository.init(dirPath, 0)
    const signature = await this.Git.Signature.default(repository)
    const status = await repository.getStatus()
    const paths = status.map(statusFile => statusFile.path())

    repository.createCommitOnHead(paths, signature, signature, 'init')
    return repository
  }

  async getRepository(dirPath) {
    let repository = null
    try {
      repository = await this.Git.Repository.open(dirPath)
    } catch {
      repository = await this.initDir(dirPath)
    }
    return repository
  }

  async getDiff(newCommitOid, oldCommitOid) {
    const repository = await this.getRepository(this.projectPath)
    const newTree = await repository.getCommit(newCommitOid).then(commit => commit.getTree())
    const oldTree = await repository.getCommit(oldCommitOid).then(commit => commit.getTree())
    const diff = await this.Git.Diff.treeToTree(repository, oldTree, newTree)
    return diff
  }

  /**
   * 将修改添加到暂存区
   * @param {string} fileName
   */
  async _add(fileName) {
    const repository = await this.getRepository(this.projectPath)
    const status = await repository.getStatus()
    if (!status.length) return
    // 判断当前任务块文件是否发生改变
    if (!status.some(statusFile => statusFile.path() === fileName)) return

    const index = await repository.index()

    // 将修改的文件记录到内存中
    const addCode = await index.addByPath(fileName)
    if (addCode) return

    // 将内存的记录写到磁盘
    const writeCode = await index.write()
    if (writeCode) return

    const treeOid = await index.writeTree()
    if (!treeOid) return

    return treeOid
  }

  async _createSignature() {
    const repository = await this.getRepository(this.projectPath)
    const signature = await this.Git.Signature.default(repository)
    return signature
  }

  async _createCommit(treeOid, message = '') {
    if (!treeOid) return

    const repository = await this.getRepository(this.projectPath)
    const signature = await this._createSignature()
    const headCommit = await repository.getHeadCommit()

    let parents
    if (headCommit) {
      parents = [headCommit]
    }

    const commitOid = await repository.createCommit('HEAD', signature, signature, message, treeOid, parents)
    return commitOid
  }
}

const gitService = new GitService()