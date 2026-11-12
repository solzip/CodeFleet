"""Owner-authorized, snapshot-bound one-shot repository consolidation.
No provider/model/authentication workflow is invoked. A changed remote ref blocks cleanup.
"""
import json, os, pathlib, re, subprocess, sys, urllib.request
ROOT = pathlib.Path.cwd()
KEEP = 'work/codefleet-integration'
REPO = 'solzip/CodeFleet'
EXPECTED = {
 'main':'b89f0feaf8fb4e30db0031173aeb7c61095abf1a',
 'release/codex-supervised-alpha4':'5fa8bab7f3f41a3582e5b844700018f7e5d7740e',
 'work/codex-mvp-hardening-integration-20261110':'008156f23748f052a405cb9ff3139fcbeab11279',
 'work/codex-mvp-main-review-candidate-20261110':'e11ee8c0badeb6a5b47637c797b737202347ad3d',
 'work/codex-mvp-persistent-worklog-integration-20261110':'03c954ac0f87b9eecf63dd5e5cd86a8eb4fc4c9c',
 'work/codex-mvp-vertical':'1b45e2bb8db7f3a25ec39718717f4d228e1af9ca',
 'work/codex-todo-calendar-real-vertical-20261111':'7e304033c5e391da59c77ad75c9c6acbecbcba45',
 'work/codex-turn-item-binding-20261110':'b68c44e57241d9c9172964f7af1204ef816ae3de',
 'work/core-contract-recovery-manager':'e2df49a3e9a5c215129d7675b51d90993c8cd184',
 'work/p0-persistent-worklog':'0f4918a05a744e2f3f061fb2701b4a22867fa31e',
 'work/p0-verified-repair-loop':'22328299983ef6e9255ecdea40dbdfd720916393',
 'work/p1-b-durable-reservation':'19ddf671410e92fc9d9e4fa423aeb829981c5bfa',
 'work/p1-proof-stdio-drain-r3-20261110':'26d7f505b3c373979df18b3d34a1975764ab33a1',
 'work/p1-r2-offline-evidence-review-20261110':'6520c7b2b77255def6a85a771cce70673eae0f19',
 'work/p1-r3-fixture-preparation-20261111':'622c2d85ecee3c924b71a8096bf6fff2d4e8d331',
 'work/p1-r3-live-record-p2-design-20261111':'4a655f01072bd85fe6d8592d8b097228a34c1973',
 'work/p1-r3-native-readonly-inspection-20261111':'66b76f51101d47944334ded6fb4cffb1a49f4070',
 'work/p1-r3-source-binding-20261110':'8deb5730ecc5ae1a61b6724307405348f92caa3e',
 'work/p2-durable-one-shot-offline-intent-20261111':'921467c10ed82c9430dc111db7c6b7be329cf14d',
 'work/p2-native-one-turn-owner-gated-20261111':'227da82b0b3b4e1d99cd20f2d3c1f6925f106063',
 'work/p2-native-preflight-readonly-20261111':'80775d0b34713b21a2c8eca9fbd202fa9b4911b3',
 'work/p2-offline-readonly-protocol-20261111':'6ea36500313935a44ef5300622fff2ddd1a1ae8c',
 'work/p2-signed-scope-offline-20261111':'1dd907f392b1164bef5a26aa0794fce3b9cb6c04',
 'work/p2-synthetic-process-evidence-20261111':'be3ad75b3e9cc7dc8b8ea4008c94dd21ad216351',
 'work/pr14-criterion-identity-20261110':'7de9df68773d351406abfab97fc49e35ea1c3f37',
 'work/r01-live-acceptance-integrity-20261112':'adae700c3c971c678b0388d99449c563451023cf'
}
REVIEWED = {'src':'bd51f31d4b6a4606feb558f1122db13f9d122e84',
 'test':'9ef0a66671f65acdee781ed4a41046e0d78c4948',
 'tools':'85f9213d61e69830239c32c0386f061a5940e797',
 'package.json':'fcae205ee719c513eab232eae1e680885656fd34',
 '.github/workflows/alpha.yml':'249e222b2d22a85bc1cf522619cab35f457a8e89'}

def git(*args):
    return subprocess.check_output(['git',*args],text=True).strip()
def run(*args):
    subprocess.run(list(args),check=True)
def write(name,text):
    p=ROOT/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8')
def stage(n,name):
    return subprocess.check_output(['git','show',f':{n}:{name}'],text=True)
def ancestor(a,b):
    return subprocess.run(['git','merge-base','--is-ancestor',a,b],check=False).returncode==0
def remote_heads():
    return {ref.removeprefix('refs/heads/'):sha for sha,ref in (l.split() for l in git('ls-remote','--heads','origin').splitlines())}
def require_snapshot(candidate):
    assert remote_heads()=={**EXPECTED,KEEP:candidate}, 'Remote branch inventory changed; no deletion or main update allowed'
def validate_source():
    assert all(ancestor(s,'HEAD') for s in EXPECTED.values()), 'Original head missing from ancestry'
    for name,sha in REVIEWED.items():
        assert git('rev-parse','HEAD:'+name)==sha, 'Reviewed source tree mismatch: '+name

def integrate_sources():
    order=['work/codex-mvp-vertical','work/p2-signed-scope-offline-20261111','work/codex-turn-item-binding-20261110','work/pr14-criterion-identity-20261110','work/p0-persistent-worklog']
    for number,name in enumerate(order):
        sha=EXPECTED[name]
        if ancestor(sha,'HEAD'): continue
        proc=subprocess.run(['git','merge','--no-commit','--no-ff',sha],check=False)
        assert proc.returncode in (0,1), 'Merge failed before conflict review'
        conflicts=set(filter(None,git('diff','--name-only','--diff-filter=U').splitlines()))
        if number==0:
            assert conflicts=={'README.md','README.en.md','docs/INDEX.md','package.json','src/product/cli.mjs'}, conflicts
            for f in ['README.md','README.en.md']:write(f,stage(2,f))
            ours,theirs=stage(2,'docs/INDEX.md'),stage(3,'docs/INDEX.md')
            section=theirs[theirs.index('## 2026-11-11'):theirs.index('## 2026-10-28')]
            write('docs/INDEX.md',ours.replace('## 2026-10-30',section+'## 2026-10-30',1))
            p,q=json.loads(stage(2,'package.json')),json.loads(stage(3,'package.json'))
            p['scripts']['test:codex-mvp']=q['scripts']['test:codex-mvp']
            write('package.json',json.dumps(p,indent=2)+'\n')
            f='src/product/cli.mjs';c=(ROOT/f).read_text()
            matches=list(re.finditer(r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> [a-f0-9]+\n',c,re.S))
            assert len(matches)==1
            m=matches[0];assert all('store = new Store(directory, { readOnly:' in m[i] for i in (1,2))
            names=list(dict.fromkeys(re.findall(r"'([^']+)'",m[1]+m[2])))
            write(f,c[:m.start()]+"    store = new Store(directory, { readOnly: ["+', '.join(repr(x) for x in names)+"].includes(argv[0]) });\n"+c[m.end():])
        elif number==1:
            assert conflicts=={'package.json'},conflicts
            p,q=json.loads(stage(2,'package.json')),json.loads(stage(3,'package.json'))
            for key in ['test:p1-proof-offline','test:p2-proof-offline']:p['scripts'][key]=q['scripts'][key]
            write('package.json',json.dumps(p,indent=2)+'\n')
        elif number==4:
            assert conflicts=={'docs/INDEX.md','src/product/cli.mjs'},conflicts
            for f in conflicts:write(f,stage(2,f))
        else: assert not conflicts,conflicts
        if conflicts: run('git','add',*sorted(conflicts))
        if number in (2,3,4):assert not git('diff','--cached','--name-only'), 'Previously integrated history introduced an unexpected change'
        run('git','commit','-m','merge: consolidate preserved history from '+name)
    validate_source()

def document():
    source=git('rev-parse','HEAD')
    record={'date':'2026-11-12','sourceMergeCommit':source,'originalHeads':EXPECTED,'reviewedTrees':REVIEWED,
      'keepBranches':['main',KEEP],'archiveTagPrefix':'archive/2026-11-12/branches/',
      'validationAtRecordCreation':'PENDING_EXACT_CANDIDATE_CI','cleanupAtRecordCreation':'NOT_RUN',
      'hostLiveAcceptance':'NOT_ESTABLISHED','modelCalls':0}
    write('docs/handoffs/2026-11-12/branch-consolidation.json',json.dumps(record,indent=2)+'\n')
    note=f'''# Repository consolidation — owner-authorized execution record

| Field | Value |
| --- | --- |
| Work date | 2026-11-12 KST |
| Target commit | `{source}` |
| Type | All-branch integration, exact-source validation and reversible ref cleanup |
| Predecessor | [Branch review](../../handoffs/2026-11-12/REPORT_KO.md) |
| New audit ID | None; no finding is reclassified |

## Scope and resolution

All original 26 branch HEADs are ancestors of the target commit, including all six maximal source tips. No branch content was discarded merely because it was old. Duplicate patch histories were joined after verifying that they introduced no additional file changes.

The managed Goal/recovery CLI and MCP/Work Log commands are retained together. Read-only Store commands are the union of both reviewed lists. Package scripts retain MCP, installed Goal, Todo, Live-safety and managed recovery coverage, plus the P1/P2 offline suites. Documentation index entries from both histories are retained and measured counts recomputed. Existing item-binding and criterion-identity fixes remain present.

P2 native execution remains blocked; P1 old-R2 execution remains on hold. Source integration, offline tests and repository cleanup do not grant model usage or establish Host Live, protected Owner identity or a monetary cost cap.

## Evidence and deletion gates

[Snapshot and source tree digests](../../handoffs/2026-11-12/branch-consolidation.json) bind every original branch. Source/test/tools/package trees equal the independently reviewed local integration. Local Node 22 syntax and link checks passed; local facts check exited 1 because Legacy measurements had not run. The exact integrated candidate must pass Node 24.14.1 Windows and Linux mandatory suites and both no-model Codex CLI compatibility jobs before cleanup.

At this record's creation CI and cleanup are PENDING. Actual results are in Repository consolidation Actions, including its candidate SHA, job conclusions and cleanup artifact. No future PASS is asserted here.

Cleanup requires an unchanged remote snapshot, all original HEADs in candidate ancestry, remotely confirmed archive tags, and success of every required validation job. It then atomically fast-forwards main and deletes only the snapshotted non-main branches using exact ref leases. The work branch stays at the same tested candidate. Any drift or failed gate stops deletion. Superseded PR discussions and their historical evidence remain available.

## Conclusion

All source histories are integrated; actual CI and ref-mutation results must be read from the exact Actions run. No real model acceptance is claimed.

## Next work

Use the [consolidated local instructions](../../handoffs/2026-11-12/CONSOLIDATED_LOCAL_TESTS_KO.md) after cleanup. Do not reuse the historical fde7689-only checkout gate.

## Unresolved

Actual Codex/Claude model acceptance, browser E2E, Owner authentication and cost limits remain open. The user's local branches, unpublished commits and worktrees were not deleted or inspected.
'''
    write('docs/runs/2026-11-12/repository-consolidation.md',note)
    for name in ['README.md','R02_PREFLIGHT_KO.md']:
        f='docs/handoffs/2026-11-12/'+name;c=(ROOT/f).read_text();pos=c.index('\n')+1
        c=c[:pos]+'\n> 통합 이후에는 [통합본 로컬 점검](CONSOLIDATED_LOCAL_TESTS_KO.md)을 사용한다. 아래는 원래 PR #33 후보의 역사적 인계다.\n'+c[pos:];write(f,c)
    f='docs/PLAN/codefleet-codex-mvp-implementation-status.md';write(f,'\n'.join(l.rstrip() for l in (ROOT/f).read_text().splitlines())+'\n')
    f='docs/INDEX.md';c=(ROOT/f).read_text();c=c.replace('## 2026-11-11','## 2026-11-12\n\n| Date | Document | Type | Result | Follow-up |\n| --- | --- | --- | --- | --- |\n| 11-12 | `runs/2026-11-12/repository-consolidation.md` | All-branch consolidation | All source histories integrated; exact-head results in Actions | [Local preflight](handoffs/2026-11-12/CONSOLIDATED_LOCAL_TESTS_KO.md) |\n\n## 2026-11-11',1)
    counts={k:len(list((ROOT/'docs'/k).rglob('*.md'))) for k in ['audits','runs','archive']};total=sum(counts.values());ar=total-counts['archive']
    c=re.sub(r'작성 기준: 2026-10-30\. 전수 .*?<!-- fact: docs-on-disk = \d+ -->',f'작성 기준: 2026-11-12. 전수 {total}개 문서 (감사 {counts["audits"]} · 실행 {counts["runs"]} · 아카이브 {counts["archive"]}). <!-- fact: docs-indexed = {total} --> <!-- fact: docs-on-disk = {total} -->',c);write(f,c)
    for f in ['README.md','README.en.md']:
        c=(ROOT/f).read_text().replace('143편',str(ar)+'편').replace('The 143 audit','The '+str(ar)+' audit').replace('audit-run-records = 143','audit-run-records = '+str(ar));write(f,c)
    run('git','add','README.md','README.en.md','docs');run('git','diff','--cached','--check')
    run('git','commit','-m','docs: record consolidated source lineage and current local handoff')
    validate_source()

def api(method,path,body=None):
    req=urllib.request.Request('https://api.github.com/repos/'+REPO+path,
      data=None if body is None else json.dumps(body).encode(),method=method,
      headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
    with urllib.request.urlopen(req,timeout=30) as res:
        raw=res.read();return json.loads(raw) if raw else None

def merge():
    start=os.environ['GITHUB_SHA'];assert git('rev-parse','HEAD')==start
    require_snapshot(start)
    integrate_sources();document()
    run('node','scripts/check-links.mjs');run('node','scripts/check-doc-citations.mjs')
    candidate=git('rev-parse','HEAD');require_snapshot(start)
    run('git','push','--force-with-lease=refs/heads/'+KEEP+':'+start,'origin','HEAD:refs/heads/'+KEEP)
    assert remote_heads()[KEEP]==candidate
    with open(os.environ['GITHUB_OUTPUT'],'a') as out:out.write('candidate='+candidate+'\n')
    print('PUBLISHED_CANDIDATE',candidate)

def cleanup():
    candidate=os.environ['CANDIDATE'];assert re.fullmatch('[a-f0-9]{40}',candidate)
    assert git('rev-parse','HEAD')==candidate
    validate_source();require_snapshot(candidate)
    tags={};prefix='archive/2026-11-12/branches/'
    oldtags={ref:sha for sha,ref in (l.split() for l in git('ls-remote','--tags','origin').splitlines())}
    refspec=[]
    for name,sha in EXPECTED.items():
        tag=prefix+name;ref='refs/tags/'+tag;tags[tag]=sha
        if ref in oldtags:assert oldtags[ref]==sha,'Archive tag collision'
        else:run('git','tag',tag,sha);refspec.append(ref+':'+ref)
    if refspec:run('git','push','--atomic','origin',*refspec)
    confirmed={ref:sha for sha,ref in (l.split() for l in git('ls-remote','--tags','origin').splitlines())}
    assert all(confirmed.get('refs/tags/'+tag)==sha for tag,sha in tags.items())
    require_snapshot(candidate)
    removed={name:sha for name,sha in EXPECTED.items() if name!='main'}
    leases=['--force-with-lease=refs/heads/'+name+':'+sha for name,sha in EXPECTED.items()]
    run('git','push','--atomic',*leases,'origin',candidate+':refs/heads/main',*[':refs/heads/'+name for name in removed])
    final=remote_heads();assert final=={'main':candidate,KEEP:candidate},final
    prs=[]
    for page in range(1,11):
        batch=api('GET','/pulls?state=all&per_page=100&page='+str(page));prs.extend(batch)
        if len(batch)<100:break
    dispositions=[]
    for pr in prs:
        if pr['number'] not in range(13,34):continue
        if pr['head']['repo'] is None or pr['head']['repo']['full_name']!=REPO:continue
        name=pr['head']['ref']
        if name not in removed:continue
        assert ancestor(pr['head']['sha'],candidate),'PR HEAD not preserved'
        api('POST','/issues/'+str(pr['number'])+'/comments',{'body':'Owner-requested all-branch consolidation completed. Original head `'+pr['head']['sha']+'` is preserved in the ancestry of main and `'+KEEP+'` at `'+candidate+'`. Archive tag: `'+prefix+name+'`. Required Windows/Linux and no-model Codex CLI jobs passed in this consolidation run. This supersedes the separate branch, not its historical failures or Host Live limitations. No real model Turn was executed.'})
        if pr['state']=='open':api('PATCH','/pulls/'+str(pr['number']),{'state':'closed'})
        dispositions.append({'number':pr['number'],'originalState':pr['state'],'merged':pr['merged_at'] is not None})
    result={'candidate':candidate,'remainingBranches':final,'archivedTags':tags,'deletedBranches':removed,'pullRequests':dispositions,'modelCalls':0,'hostLiveAcceptance':'NOT_ESTABLISHED'}
    pathlib.Path('/tmp/consolidation-result.json').write_text(json.dumps(result,indent=2)+'\n')
    with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as out:out.write('## Consolidation complete\n\n```json\n'+json.dumps(result,indent=2)+'\n```\n')
    print(json.dumps(result,indent=2))

if __name__=='__main__':
    assert os.environ.get('GITHUB_REPOSITORY')==REPO
    assert os.environ.get('GITHUB_REF')=='refs/heads/'+KEEP
    assert len(sys.argv)==2 and sys.argv[1] in ('merge','cleanup')
    run('git','config','user.name','solarchive');run('git','config','user.email','155644899+solzip@users.noreply.github.com')
    globals()[sys.argv[1]]()
