# How to use

```yml
server:
  ipAddress: 5.189.142.96
  port: 3000
  id: 'uijknvkladjfkdlfwfdbfnjhuisfjklbcnmakhdfgjdklsa'
  pwd: 'fdhajkl2bf8doasvbjfoaz72381bfhjdkashf3u1iobfhdjask'

jobs:
  - email
  - gitlab

email:
  scriptId: 0
  calledPerDay: 4
  timeout: 1200000
  calledPerMonth: 1
  calledPerYear: 2
  saveLocation: ""
  deleteAfter: 3

gitlab:
  scriptId: 1
  calledPerDay: 1
  deleteAfter: 3
```