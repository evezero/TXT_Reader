import { useState, useEffect } from 'react'
import { open } from '@tauri-apps/plugin-dialog'

export interface LibraryNode {
  id: string
  type: 'folder' | 'book'
  name: string
  parentId: string | null
  filePath?: string
  lastOpenedAt?: number
}

const LIBRARY_KEY = 'txtreader-library'

function loadLibrary(): LibraryNode[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (raw) return JSON.parse(raw)
    
    // Migrate old history
    const oldRaw = localStorage.getItem('txtreader-history')
    if (oldRaw) {
      const oldHist = JSON.parse(oldRaw) as any[]
      return oldHist.map((h, i) => ({
        id: `book-${Date.now()}-${i}`,
        type: 'book',
        name: h.fileName,
        filePath: h.filePath,
        parentId: null,
        lastOpenedAt: h.lastOpenedAt,
      }))
    }
  } catch {}
  return []
}

interface BookshelfProps {
  onOpenBook: (filePath: string) => void
}

export function Bookshelf({ onOpenBook }: BookshelfProps) {
  const [library, setLibrary] = useState<LibraryNode[]>(loadLibrary)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library))
  }, [library])

  const currentNodes = library.filter((n) => n.parentId === currentFolderId)
  const folders = currentNodes.filter((n) => n.type === 'folder')
  const books = currentNodes.filter((n) => n.type === 'book')

  // 获取当前路径的面包屑
  const getBreadcrumbs = () => {
    const crumbs: { id: string | null; name: string }[] = [{ id: null, name: '根目录' }]
    let curr = currentFolderId
    const path: { id: string; name: string }[] = []
    while (curr) {
      const node = library.find((n) => n.id === curr)
      if (node) {
        path.unshift({ id: node.id, name: node.name })
        curr = node.parentId
      } else {
        break
      }
    }
    return [...crumbs, ...path]
  }

  const handleCreateFolder = () => {
    const name = prompt('请输入文件夹名称：')
    if (!name || name.trim() === '') return
    const newNode: LibraryNode = {
      id: `folder-${Date.now()}`,
      type: 'folder',
      name: name.trim(),
      parentId: currentFolderId,
    }
    setLibrary((prev) => [...prev, newNode])
  }

  const handleAddBooks = async () => {
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        filters: [{ name: '文本文件', extensions: ['txt', 'md'] }, { name: '所有文件', extensions: ['*'] }],
      })
      if (!selected) return
      const filePaths = Array.isArray(selected) ? selected : [selected]
      
      setLibrary((prev) => {
        const newNodes = [...prev]
        for (const fp of filePaths) {
          // 避免在同一层级重复添加
          if (newNodes.some((n) => n.type === 'book' && n.filePath === fp && n.parentId === currentFolderId)) {
            continue
          }
          const fileName = fp.split('\\').pop()?.split('/').pop() ?? fp
          newNodes.push({
            id: `book-${Date.now()}-${Math.random()}`,
            type: 'book',
            name: fileName,
            filePath: fp,
            parentId: currentFolderId,
            lastOpenedAt: Date.now(),
          })
        }
        return newNodes
      })
    } catch (err) {
      console.error('Failed to open files:', err)
    }
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定要从书架移除此项目吗？（不删除本地文件）')) return
    
    // 递归收集要删除的 ID
    const idsToDelete = new Set<string>([id])
    let added = true
    while (added) {
      added = false
      for (const node of library) {
        if (node.parentId && idsToDelete.has(node.parentId) && !idsToDelete.has(node.id)) {
          idsToDelete.add(node.id)
          added = true
        }
      }
    }
    
    setLibrary((prev) => prev.filter((n) => !idsToDelete.has(n.id)))
  }

  const breadcrumbs = getBreadcrumbs()

  return (
    <div className="empty-state" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* 工具栏和面包屑 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', zIndex: 10 }}>
          <div style={{ display: 'flex', gap: 8, fontSize: 16, fontWeight: 600, alignItems: 'center' }}>
            {currentFolderId && (
              <button
                className="empty-btn"
                style={{ padding: '4px 12px', marginRight: 12, background: 'var(--panel-bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
                onClick={() => {
                  const node = library.find((n) => n.id === currentFolderId)
                  setCurrentFolderId(node ? node.parentId : null)
                }}
              >
                ← 返回上一级
              </button>
            )}
            {breadcrumbs.map((crumb, idx) => (
              <span key={crumb.id ?? 'root'} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {idx > 0 && <span style={{ color: 'var(--tab-text)', fontSize: 14 }}>/</span>}
                <button
                  style={{
                    background: 'none', border: 'none', color: idx === breadcrumbs.length - 1 ? 'var(--text)' : 'var(--accent)',
                    cursor: idx === breadcrumbs.length - 1 ? 'default' : 'pointer', fontSize: 'inherit', fontWeight: 'inherit', fontFamily: 'inherit'
                  }}
                  onClick={() => setCurrentFolderId(crumb.id)}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="empty-btn" style={{ padding: '8px 16px', background: 'var(--input-bg)', color: 'var(--text)' }} onClick={handleCreateFolder}>
              新建文件夹
            </button>
            <button className="empty-btn" style={{ padding: '8px 16px' }} onClick={handleAddBooks}>
              导入书籍
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 40px' }}>
          {currentNodes.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 80, color: 'var(--tab-text)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
              <p style={{ marginBottom: 24 }}>当前目录为空，请添加书籍或新建文件夹</p>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                <button className="empty-btn" style={{ padding: '10px 24px', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 15, borderRadius: 6 }} onClick={handleCreateFolder}>
                  新建文件夹
                </button>
                <button className="empty-btn" style={{ padding: '10px 24px', background: 'var(--accent)', color: 'white', fontSize: 15, border: 'none', borderRadius: 6, cursor: 'pointer' }} onClick={handleAddBooks}>
                  导入书籍
                </button>
              </div>
            </div>
          ) : (
            <div className="bookshelf-grid">
              {folders.map((folder) => (
                <div key={folder.id} className="book-item" onClick={() => setCurrentFolderId(folder.id)} style={{ position: 'relative' }}>
                  <div className="book-cover" style={{ background: 'var(--input-bg)', color: 'var(--text)', aspectRatio: '1/1' }}>
                    <div style={{ fontSize: 48 }}>📁</div>
                  </div>
                  <div className="book-info" style={{ alignItems: 'center' }}>
                    <div className="book-name" title={folder.name}>{folder.name}</div>
                  </div>
                  <button
                    className="book-delete-btn"
                    onClick={(e) => handleDelete(folder.id, e)}
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {books.map((book) => (
                <div key={book.id} className="book-item" onClick={() => book.filePath && onOpenBook(book.filePath)} style={{ position: 'relative' }}>
                  <div className="book-cover">
                    <div className="book-cover-text">{book.name.replace(/\.txt|\.md$/i, '').slice(0, 5)}</div>
                  </div>
                  <div className="book-info">
                    <div className="book-name" title={book.name}>{book.name}</div>
                    <div className="book-time">{book.lastOpenedAt ? new Date(book.lastOpenedAt).toLocaleDateString() : ''}</div>
                  </div>
                  <button
                    className="book-delete-btn"
                    onClick={(e) => handleDelete(book.id, e)}
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
