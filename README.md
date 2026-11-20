# 课后三表循环听写（PWA）

小学语文「识字表 / 写字表 / 词语表」循环听写工具。纯静态、纯本地：无后端、无账号、无上传，所有数据只存在浏览器 localStorage。

## 功能

- **三表内容**：按年级/册浏览识字表、写字表、词语表；支持重点课标注；每课可一键加入听写单
- **词库整理**：可编辑/删除/新增任意一课；支持导出/导入修改；可一键重置回原始词库
- **每日听写**：历史按日期聚合；iOS 风格日历筛选；导出/导入备份
- **听写统计**：累计正确率 + 近 7 天每日正确率条形图
- **自定义**：错词库自动收集（按错误次数排序，可一键重练）；自建词组（名称 + 每行一词）
- **听写会话**：Web Speech 中文 TTS 自动循环播报（连读遍数、间隔、语速、音调、声音可调）；点击字词标记对错
- **PWA**：manifest + Service Worker，可「添加到主屏幕」，离线可用

## 使用

部署后用浏览器打开即可。手机端建议：菜单 → 添加到主屏幕。

## 文件

```
index.html            入口
css/styles.css        样式
js/data.js            词库（window.APP_DATA，version 26年春季版）
js/store.js           localStorage 存储层
js/app.js             页面逻辑
manifest.webmanifest  PWA 清单
sw.js                 Service Worker（缓存离线）
icons/icon.svg        图标
```
