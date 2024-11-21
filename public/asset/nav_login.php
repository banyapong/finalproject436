<nav class="navbar navbar-expand-lg bg-body-tertiary">
    <div class="navbar-container d-flex justify-content-between align-items-center">
        <a class="navbar-brand" href="">Project CS436</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarSupportedContent">
            <ul class="navbar-nav me-auto mb-2 mb-lg-0"></ul>
            <ul class="navbar-nav navbar-right"> <!-- เพิ่มคลาสใหม่เพื่อจัดการตำแหน่งด้วย CSS -->
                <?php if (isset($_SESSION['userid'])) { ?>
                    <li class="nav-item">
                        <a class="btn btn-danger" href="logout.php">Logout</a>
                    </li>
                <?php } else { ?>
                    <li class="nav-item">
                        <a class="btn btn-secondary" href="signin.php">Sign In</a>
                    </li>
                    <li class="nav-item">
                        <a class="btn btn-primary" href="signup.php">Sign Up</a>
                    </li>
                <?php } ?>
            </ul>
        </div>
    </div>
</nav>
