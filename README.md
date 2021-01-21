# git 概念介绍

## 1. blob:

```c#
struct git_blob {
    git_object object;
    git_odb_object *odb_object;
};
```

blob 对象直接包含 git_object ，但是 git_object 这个概念是封装起来的，我们一般情况下是接触不到的。它将直接对应存放在仓库中的数据文件，对于 blob 我们就把它直接理解成我们文件夹中的文件就可以了。它是整个 git 仓库管理的基础单位，作为实际文件的代表，可以说 git 的版本管理就是花式玩儿 blob 。

## 2. oid:

指的是 git_object 的 id。每个独立的 git_object 都有一个 id，id 相等则可以判定是同一个对象。
它存储的是一个 SHA-1 值，20 个字节大小，每个字节存放一个 16 进制数。如果转成字符串，则是一个 40 个字符长的字符串，两个字符表示一个 16 进制数。
相互转换的函数：
git_oid_fromstr 把 SHA-1 转成 oid
git_oid_tostr 把 oid 转成 SHA-1

## 3. tree 和 tree entry:

tree 就如它字面上的意思，是一个树形数据结构，tree entry 就是这个树的节点。

```c#
size_t tree_entry_count = git_tree_entrycount(tree);
std::cout<< "tree entry count: " << tree_entry_count << std::endl;
for(size_t i = 0; i < tree_entry_count; ++i)
{
    const git_tree_entry* te = git_tree_entry_byindex(tree, i);
    const char* te_name = git_tree_entry_name(te);
    const git_oid* te_oid = git_tree_entry_id(te);
    const char* teid = git_oid_tostr_s(te_oid);
    git_otype otype = git_tree_entry_type(te);
    git_filemode_t filemode = git_tree_entry_filemode(te);
    std::cout<< "tree entry file name: " << te_name << " \toid: " << teid
    << " \totype: " << otype << " \tfilemode: " << filemode << std::endl;
}
```

可以用上边的方法简单遍历 tree 的一层，这些 entry 可能是没有子节点的“文件”，也有可能是还有子节点的“文件夹”，也就是说，tree entry 还可以作为 tree 持有自己的 tree entry。

```c#
if (otype == GIT_OBJ_TREE)
{
    git_tree* leaf_tree = nullptr;
    git_tree_lookup(&leaf_tree, rep, te_oid);
    size_t leaf_entry_count = git_tree_entrycount(leaf_tree);
    for(size_t j = 0; j < leaf_entry_count; ++j)
    {
        const git_tree_entry* leaf_te = git_tree_entry_byindex(tree, j);
        const char* leaf_te_name = git_tree_entry_name(leaf_te);
        const git_oid* leaf_te_oid = git_tree_entry_id(leaf_te);
        const char* leaf_teid = git_oid_tostr_s(leaf_te_oid);
        git_otype leaf_otype = git_tree_entry_type(leaf_te);
        git_filemode_t leaf_filemode = git_tree_entry_filemode(leaf_te);
        std::cout<< "\tleaf tree entry file name: " << leaf_te_name << " \toid: " << leaf_teid
        << " \totype: " << leaf_otype << " \tfilemode: " << leaf_filemode << std::endl;
    }
}
```

通过 git_filemode_t 我们可以看出，entry 就可以表示一个 blob。

```c#
/** Valid modes for index and tree entries. */
typedef enum {
    GIT_FILEMODE_UNREADABLE = 0000000,
    GIT_FILEMODE_TREE = 0040000,
    GIT_FILEMODE_BLOB = 0100644,
    GIT_FILEMODE_BLOB_EXECUTABLE = 0100755,
    GIT_FILEMODE_LINK = 0120000,
    GIT_FILEMODE_COMMIT = 0160000,
} git_filemode_t;
```

这里有一个要注意的地方，这个枚举的值是以 8 进制表示的，直接以 10 进制数方式打印，跟这个字面值是不一样的。

## 4. commit:

commit 是版本的基本单位，版本库的记录都是以 commit 为基础的，谁提交的、什么时候提交的、提交的说明信息、提交时的 tree 的状态都是由 commit 管理的。它还要知道它的父级 commit 是哪个或者哪几个，最终 commit 们会组成一个有向图。
我们要找某一个版本，就是去找这个版本的 commit ，有了这个 commit 我们就可以通过它调出那个版本当时的 tree，然后由 tree 管理的所有文件就都可以找到了。可以说 commit 是 git 版本管理的核心，其他所有的概念都是围绕着 commit 展开的。

```c#
// 通过 commit 获得 tree
git_tree* tree = nullptr;
git_commit_tree(&tree, commit);
```

## 5. reference:

这个引用怎么用语言来描述我一直很纠结。reference 引用的是一条 commit 链——更准确的说不应该是链，因为 commit 网上追溯有可能有多个父 commit 的情况。它实际上是一个倒过来的树，reference 是它的根节点，commit 的 parent 就是子节点。这是为了方便向上追溯版本。
实际上每多一个分支，就相当于多了一个 reference ，reference 就包含着这个分支的最新的一个 commit。
git 系统也预置了几个重要的 reference 名称，用于方便索引。其中最重要的就是 HEAD 了，在工程的 .git 文件夹就可以看到这个文件，打开看看，它只有一个指向一个 refs 文件夹的路径，实际上它指向的就是当前所在的分支。所以，通过 HEAD 就可以非常方便的找到当前的 reference。

```c#
git_reference* head_ref = nullptr;
// 当前 head 引用
git_repository_head(&head_ref, rep);

const git_oid* oid_ref = git_reference_target(head_ref);
const char* roid = git_oid_tostr_s(oid_ref);

git_commit* commit = nullptr;
// 这个分支中最新一个 commit
git_commit_lookup(&commit, rep, oid_ref);
```

## 6. branch:

在上边 reference 的部分我多次提到了“分支”这个词，然而了解一些 git 命令行工具的同学肯定知道，git 工具分支的命令是 branch ，而且日常沟通也都是以 branch 的概念来代表分支的。
这没有错，git 概念中的分支就是 branch ，同时 libgit2 这个库中也有 branch 这个概念，它所指的实际上就是 reference 。就是给 reference 起了个名字，这个名字是方便记忆的，而不是 reference 用的一个路径。

```c#
GIT_EXTERN(int) git_branch_lookup(
    git_reference **out,
    git_repository *repo,
    const char *branch_name,
    git_branch_t branch_type);
```

从这个函数声明就可以看出，通过一个分支名返回是一个 reference ，同时，在函数实现的内部，也是通过 git_reference_lookup 实现的。因此可以看出，branch 实际上就是一个有名字的 reference 。

```c#
git_reference* branch_ref = nullptr;
// 通过分支名取到 reference
git_branch_lookup(&branch_ref, rep, "master", GIT_BRANCH_LOCAL);
const git_oid* oid_branch = git_reference_target(branch_ref);
const char* boid = git_oid_tostr_s(oid_branch);
```

如果此时 HEAD 就是 master 分支的话，roid 和 boid 的值是相等的。

## 7. index 和 index entry:

index 索引的是当前工作区中未提交的内容。完整的 commit 操作就是将 index 中的内容写到一个 tree ，然后用这个新的 tree 创建一个新的 commit ，然后更新 reference 。而在这之前的 add 操作，就是将改动更新到当前 index。
index entry 就像 tree entry 也是作为文件的代表，而不一样的地方就是，单独的文件夹不再是 tree 了。可以通过它的 mode 属性，看出每一个文件是一个 blob ，submodule 是另外一个 blob。
实际上在没有改动的情况下 index entry 和 tree entry 是相同的 blob 。只有有新的 add 才会使同一个文件对应的 blob 不同。
