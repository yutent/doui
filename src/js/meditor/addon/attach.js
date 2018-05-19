/**
 *
 * @authors yutent (yutent@doui.cc)
 * @date    2017-04-19 21:17:26
 *
 */

'use strict'

import 'layer/index'
import './attach.scss'

const $doc = Anot(document)

class Uploader {
  constructor(url) {
    this.url = url
    this.xhr = new XMLHttpRequest()
    this.form = new FormData()
  }

  field(key, val) {
    this.form.append(key, val)
    return this
  }
  onProgress(fn) {
    this.progress = fn
    return this
  }
  then(cb) {
    if (!this.url) {
      Anot.error('invalid upload url')
    }
    let defer = Promise.defer()

    this.xhr.open('POST', this.url, true)
    this.xhr.upload.addEventListener(
      'progress',
      evt => {
        if (evt.lengthComputable && this.progress) {
          let res = Math.round(evt.loaded * 100 / evt.total)
          this.progress(res)
        }
      },
      false
    )

    this.xhr.onreadystatechange = () => {
      if (this.xhr.readyState === 4) {
        if (this.xhr.status >= 200 && this.xhr.status < 205) {
          let res = this.xhr.responseText
          try {
            res = JSON.parse(res)
          } catch (err) {}
          defer.resolve(cb(res))
        } else {
          defer.reject(this.xhr)
        }
      }
    }

    this.xhr.send(this.form)
    return defer.promise
  }
}

var $init = function(vm) {
  vm.$editor.addEventListener('paste', function(ev) {
    var txt = ev.clipboardData.getData('text/plain').trim(),
      html = ev.clipboardData.getData('text/html').trim()

    //文本类型直接默认处理
    if (txt || html) {
      return
    }

    if (ev.clipboardData.items) {
      var items = ev.clipboardData.items,
        len = items.length,
        blob = null
      for (var i = 0, it; (it = items[i++]); ) {
        if (it.type.indexOf('image') > -1) {
          blob = it.getAsFile()
        }
      }

      if (blob !== null) {
        layer.msg('截图处理中...')
        // 压缩截图,避免文件过大
        var reader = new FileReader()
        reader.onload = function() {
          var img = document.createElement('img'),
            canvas = document.createElement('canvas')

          img.onload = function() {
            canvas.width = img.width
            canvas.height = img.height

            var ctx = canvas.getContext('2d')
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(this, 0, 0, canvas.width, canvas.height)

            if (canvas.toBlob) {
              canvas.toBlob(
                function(obj) {
                  uploadScreenshot(vm, obj)
                },
                'image/jpeg',
                0.8
              )
            } else {
              var base64 = canvas.toDataURL('image/jpeg', 0.8),
                buf = atob(base64.split(',')[1]),
                arrBuf = new ArrayBuffer(buf.length),
                intArr = new Uint8Array(arrBuf),
                obj = null

              for (var i = 0; i < buf.length; i++) {
                intArr[i] = buf.charCodeAt(i)
              }
              obj = new Blob([intArr], { type: 'image/jpeg' })
              uploadScreenshot(vm, obj)
            }
          }
          img.src = this.result
        }
        reader.readAsDataURL(blob)
      }
    }
    ev.preventDefault()
  })
}

let cache = {
  //缓存附件列表
  image: [],
  file: []
}

const LANG = {
  image: ['远程图片', '图片管理', '图片描述', '图片地址'],
  file: ['远程附件', '附件管理', '附件描述', '附件地址']
}

const fixCont = function(vm, tool) {
  let limit = false
  if (vm.props.uploadSizeLimit) {
    limit = (vm.props.uploadSizeLimit / (1024 * 1024)).toFixed(2)
  }
  return `
  <dl class="do-meditor-attach do-meditor__font">
    <dt :click="close" class="do-icon-close close"></dt>
    <dt class="tab-box" :drag="do-layer" data-limit="window">
      <span class="item" :class="active:tab === 1" :click="switchTab(1)">
        ${LANG[tool][0]}
      </span>
      <span class="item" :class="active:tab === 2" :click="switchTab(2)">本地上传</span>
      <span class="item" :class="active:tab === 3" :click="switchTab(3)">
        ${LANG[tool][1]}
      </span>
    </dt>
    <dd class="cont-box">
      <div class="remote" :visible="tab === 1">
        <section class="section do-fn-cl">
          <input 
            class="txt" 
            :duplex="attachAlt" 
            placeholder="${LANG[tool][2]}" />
        </section>
        <section class="section do-fn-cl">
          <input 
            class="txt" 
            :duplex="attach" 
            placeholder="${LANG[tool][3]}" />
        </section>
        <section class="section do-fn-cl">
          <a 
            href="javascript:;" 
            class="do-meditor__button submit" 
            :click="$confirm">确定</a>
        </section>
      </div>
      <div class="local" :visible="tab === 2">
        <div class="select-file">
          <input ref="attach" multiple :change="change" type="file" class="hide" />
          <span class="file" :click="select">选择文件</span>
          ${
            limit
              ? `<span class="tips">(上传大小限制:单文件最大${limit} MB)</span>`
              : ''
          }
        </div>
        <ul class="upload-box">
          <li class="thead">
            <span class="col">文件名</span>
            <span class="col">上传进度</span>
            <span class="col">操作</span>
          </li>
          <li class="tbody">
            <p :repeat="uploadQueue">
              <span 
                class="col do-fn-ell" 
                :text="el.name" 
                :layer-tips="el.name"></span>
              <span class="col" :html="el.progress"></span>
              <span class="col"><a class="insert" :click="insert(el)">插入</a></span>
            </p>
          </li>
        </ul>
      </div>
      <ul class="manager" :visible="tab === 3">
        <li class="item" :repeat="attachList" :click="insert(el)">
          <span class="thumb" :html="el.thumb"></span>
          <p class="name" :attr-title="el.name" :text="el.name"></p>
        </li>
      </ul>
    </dd>
  </dl>`
}

/**
 * [uploadFile 文件上传]
 * @param  {[type]} vm    [vm对象]
 * @param  {[type]} tool  [image/file]
 */
function uploadFile(vm, tool) {
  for (let it of this.files) {
    let ext = it.name.slice(it.name.lastIndexOf('.'))
    if (tool === 'image' && !/^\.(jpg|jpeg|png|gif|bmp|webp|ico)$/.test(ext)) {
      this.uploadQueue.push({
        name: it.name,
        progress: '<span class="red">0%(文件类型错误)</span>',
        url: ''
      })
      continue
    }
    if (vm.props.uploadSizeLimit && it.size > vm.props.uploadSizeLimit) {
      this.uploadQueue.push({
        name: it.name,
        progress: '<span class="red">0%(文件体积过大)</span>',
        url: ''
      })
      continue
    }
    let idx = this.uploadQueue.length
    let fixName = new Date().format('YmdHis') + ext
    let attach = { name: it.name, fixName, progress: '0%', url: '' }
    let upload = new Uploader(vm.props.uploadUrl).field('file', it)

    this.uploadQueue.push(attach)

    if (vm.props.beforeUpload) {
      vm.props
        .beforeUpload(attach, upload)
        .then(next => {
          if (!next) {
            return Promise.reject('something wrong with beforeUpload')
          }
          return upload
            .onProgress(val => {
              this.uploadQueue[idx].progress = val + '%'
            })
            .then(res => {
              return res.data
            })
        })
        .then(data => {
          this.uploadQueue[idx].url = data.url
        })
        .catch(err => {
          Anot.error(err)
        })
    } else {
      upload
        .onProgress(val => {
          this.uploadQueue[idx].progress = val + '%'
        })
        .then(res => {
          return res.data
        })
        .then(data => {
          this.uploadQueue[idx].url = data.url
        })
        .catch(err => {
          Anot.error(err)
        })
    }
  }
}

function uploadScreenshot(vm, blob) {
  let name = new Date().format('YmdHis') + '.jpg'
  let attach = { name, url: '' }
  let upload = new Uploader(vm.props.uploadUrl).field('file', blob)

  if (vm.props.beforeUpload) {
    vm.props
      .beforeUpload(attach, upload)
      .then(upload => {
        return upload.then(res => {
          return res.data
        })
      })
      .then(data => {
        vm.insert(`![截图](${data.url})`)
      })
  } else {
    upload
      .then(res => {
        return res.data
      })
      .then(data => {
        vm.insert(`![截图](${data.url})`)
      })
  }
}

function getAttach(vm, cb) {
  var xhr = new XMLHttpRequest(),
    url = vm.manageUrl || ME.manageUrl

  if (/\?/.test(url)) {
    url += '&type=' + openType
  } else {
    url += '?type=' + openType
  }
  url += '&t=' + Math.random()

  xhr.open('GET', url, true)
  xhr.onreadystatechange = function() {
    if (
      this.readyState === 4 &&
      this.status === 200 &&
      this.responseText !== ''
    ) {
      var res = this.responseText
      try {
        res = JSON.parse(res)
      } catch (err) {}
      cb(res)
    } else {
      if (this.status !== 200 && this.responseText)
        console.error(this.responseText)
    }
  }
  xhr.send()
}

function showDialog(elem, vm, tool) {
  let offset = Anot(elem).offset()

  layer.open({
    type: 7,
    menubar: false,
    fixed: true,
    offset: [offset.top + 37 - $doc.scrollTop()],
    tab: 2,
    attach: '',
    attachAlt: '',
    uploadQueue: [], //当前上传的列表
    attachList: [], //附件管理列表
    switchTab(id) {
      this.tab = id
      if (id === 3) {
        this.attachList.clear()
        if (vm.props.getAttachList) {
          vm.props
            .getAttachList(tool)
            .then(list => {
              list.forEach(it => {
                let ext = it.name.slice(it.name.lastIndexOf('.'))
                it.isImage = /^\.(jpg|jpeg|png|gif|bmp|webp|ico)$/.test(ext)
                it.thumb = it.isImage
                  ? `<img src="${it.url}" />`
                  : `<em class="do-icon-txt"></em>`
              })
              return list
            })
            .then(list => {
              list = list.filter(it => {
                if (tool === 'image') {
                  return it.isImage
                }
                return true
              })
              this.attachList = list
            })
        }
      }
    },
    select() {
      let ev = document.createEvent('MouseEvent')
      ev.initEvent('click', false, false)
      this.$refs.attach.dispatchEvent(ev)
    },
    change(ev) {
      this.files = ev.target.files
      uploadFile.call(this, vm, tool)
    },
    insert: function(it) {
      if (!it.url) {
        return
      }
      let val = `\n${tool === 'image' ? '!' : ''}[${it.name}](${it.url})`
      vm.insert(val)
    },
    confirm: function() {
      if (!this.attach || !this.attachAlt) {
        return layer.toast('描述和地址不能为空', 'error')
      }
      let val = `\n${tool === 'image' ? '!' : ''}[${this.attachAlt}](${
        this.attach
      })`

      vm.insert(val)
      this.close()
    },
    content: fixCont(vm, tool)
  })
}

const addon = {
  attach(elem) {
    showDialog(elem, this, 'file')
  },
  image(elem) {
    showDialog(elem, this, 'image')
  }
}

export default addon
