# Data Folder

This folder stores only cleaned markdown files for RAG.

Raw PDFs are not stored in this project. PDFs are converted outside the project into clean `.md` files before being added here.

Loader and chunking code should read only from this path:

```text
data/class-10/science/
```

Science is divided into:

- chemistry
- physics
- biology

Chapter file naming must follow this format:

```text
chapter-01.md
chapter-02.md
chapter-03.md
```

Folder names must stay lowercase.

Each chapter `.md` file should include YAML metadata at the top, like:

```yaml
---
board: Bihar Board
class: 10
subject: Science
section: Chemistry
chapter_no: 1
chapter_title: Chapter Title Here
language: English
source_type: cleaned_markdown
---
```

Do not create a raw folder.

Do not create a processed folder.

Do not delete existing project files.

Do not modify `package.json`.

Do not add new libraries.

Do not write loader or chunking code.
